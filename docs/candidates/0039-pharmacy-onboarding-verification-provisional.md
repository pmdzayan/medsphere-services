# Candidate Task 0039 — Pharmacy Onboarding & Verification Closure

**STATUS: PROVISIONAL PARALLEL CANDIDATE — NOT AUTHORITATIVE.** Not
accepted, not merged, not pushed, not deployed, not production-ready,
not approved for production or for real healthcare data. Does not
claim government or regulator certification of any kind — "AIM
verification" means only what this workflow itself checks and a
platform reviewer approves.

## 1. Base and reconciliation history

This candidate's implementation began from
`ec1298040a2e605bfe626850249c5bf2305a96be` (Task 0026 accepted base),
then re-anchored three times as the authoritative branch advanced
during development — each re-anchor is preserved as its own
checkpoint artifact, never silently discarded or blindly rebased:

- **Implementation start**: `ec1298040a2e605bfe626850249c5bf2305a96be`
  (Task 0026 accepted)
- Re-anchor 1: `9182a6850569e7fef2f8dd1a69f82a817c772f6f` (Task 0027
  accepted — required a manual, verified schema-block merge and a
  corrected renewal-semantics redesign, §5–§6 below)
- Re-anchor 2: `5c650e30f36140c7fb1d06f18c917de0bf2fe55b` (Task 0028
  accepted — no schema/migration overlap, additive only)
- **Original candidate base**: `1ddead2f0b0862305e7f2cb7a0b9c3c707fd73fd` (Task
  0032 accepted). This corrected patch applies to `1c6b91d0f55960ba626eaecea1cf6baecc2836e8`; its migration runs after Task 0032.

Each re-anchor's delta was classified file-by-file against the new
base (still valid / already present / conflicts / needs adaptation /
stale / superseded / out of scope) before porting — never a blind
patch application.

## 2. Existing architecture reused (not duplicated)

- **`Provider`** — reused as the pharmacy profile itself; no parallel
  onboarding table.
- **`ProviderVerification`** — the accepted (pre-0039) model, extended
  (not replaced).
- **`@medsphere/security`** — `requireActiveTenantActorWithProvider`
  for every tenant-side mutation; the shared trusted-actor types.
- **`PlatformAuthGuard` + `PlatformPermissionsGuard`** — the accepted
  Task 0021 platform authorization boundary, unchanged, for every
  platform review endpoint.
- **Task 0027's provider-scoped advisory-lock pattern** —
  `pg_advisory_xact_lock(hashtext(tenantId), hashtext(providerId))` —
  reused verbatim as the serialization primitive for every
  consequential verification transition (§8).
- **`AuditWriter.appendTenantUser` / `appendPlatformUser`** — the
  accepted Task 0019 exact-user audit primitives.
- **`PlatformRepository.findEffectivePlatformPermissions`** — the
  accepted, live, DB-backed permission-resolution primitive, reused
  for reviewer re-verification (§10).

## 3. Provider-specific verification ownership

The accepted `ProviderVerification` model was tenant-scoped only and
did not prove which concrete `Provider` it verifies. This candidate
adds `providerId` (nullable) with a composite FK to
`Provider(id, tenantId)`, so a verification can never reference a
provider outside its own tenant.

**Legacy nullable `providerId` policy**: existing (pre-0039) rows are
preserved exactly as-is — never fabricated a provider, never guessed
from tenant alone, never blanket-attached to "the first pharmacy." A
CHECK constraint (`ProviderVerification_isCurrent_requires_providerId`)
makes this the database's own enforced invariant, not merely an
application convention: **a row with `providerId IS NULL` can never be
`isCurrent = true`**, so a legacy row can never make any provider
verified.

## 4. `isCurrent`: authoritative-state semantics

`isCurrent` means **"the record currently authoritative for
eligibility/state"** — deliberately **not** "the most recent
submission." A partial unique index
(`ProviderVerification_current_per_provider`, `WHERE "isCurrent" =
true`) guarantees at most one authoritative row per provider, while
unlimited historical rows (superseded approvals, rejections, expired
renewals) coexist freely.

## 5. Separate open-submission semantics

A second, **independent** partial unique index
(`ProviderVerification_open_submission_per_provider`, `WHERE status IN
('PENDING','UNDER_REVIEW')`) guarantees at most one open submission
per provider. This is never combined with the `isCurrent` concept —
that separation is exactly what makes renewal possible (§6).

## 6. Renewal behavior

A pharmacy with a valid, unexpired, `APPROVED` + `isCurrent` record
must **not** become unverified merely because it submits a renewal.
`submitVerification()`:

- **No current state, or current state is `REJECTED`/`EXPIRED`**: the
  new submission becomes `isCurrent = true` immediately (demoting any
  prior current row) — the pharmacy remains unverified until this new
  submission is itself approved.
- **Current state is a valid, unexpired `APPROVED`**: the new
  submission is created **open but not current**
  (`isCurrent = false`) — the existing approval remains authoritative
  and `Provider.isVerified` is untouched.
- **Current state is `SUSPENDED`**: the submission is **blocked
  entirely** (§7) — a tenant can never clear a platform suspension by
  submitting new evidence.

**Renewal approval** (`approve()`) atomically demotes the previous
current row and promotes the renewal, inside the same
advisory-lock-serialized transaction (§8) — exactly one authoritative
row exists after commit.

**Renewal rejection** (`reject()`) only demotes eligibility
(`Provider.isVerified = false`) when the rejected row was **itself**
the authoritative current row. Rejecting a renewal while an older,
still-valid approval remains current leaves that approval and
`Provider.isVerified` completely untouched.

## 7. Suspension behavior

A `SUSPENDED` current verification is a platform-only decision that a
tenant can never clear, replace, or bypass:

- `submitVerification()` fails closed
  (`CURRENT_VERIFICATION_SUSPENDED`) with **no row created** and **no
  submission audit event emitted** when the current state is
  `SUSPENDED`.
- No automatic unsuspension is implemented — only an explicit future
  platform workflow may change a `SUSPENDED` state.
- Suspension is serialized by the same provider-level advisory lock as
  every other consequential transition (§8), specifically closing a
  race where a concurrent renewal approval's demote/promote could
  otherwise interleave with a suspend reading stale `isCurrent` state.

## 8. Provider-scoped PostgreSQL serialization

Every consequential transition (`submitVerification`, `beginReview`,
`approve`, `reject`, `suspend`) acquires
`pg_advisory_xact_lock(hashtext(tenantId), hashtext(providerId))`
**first**, then re-reads authoritative state from **inside** the same
transaction, and only then decides — reusing Task 0027's exact
accepted serialization primitive. The original candidate includes 11 PostgreSQL concurrency scenarios.
They have not been rerun against this corrected patch in the current workspace.

## 9. Runtime expiry fail-closed evaluator

`PharmacyVerificationEligibilityEvaluator` checks authoritative
verification state for the availability-request flow — checking provider existence, type,
non-deletion, `isActive`, a single deterministic current-verification
lookup, `status = APPROVED`, and **strict runtime license-expiry**
(`licenseExpiryDate > now`, not `>=`). A pharmacy's license expiring
never has to wait for a background worker: eligibility fails the
instant the check runs. `Provider.isVerified` (§10) is never trusted
directly for this decision.

## 10. `Provider.isVerified` as projection, not authority

`Provider.isVerified` remains a transactionally-maintained _projection_
— updated atomically alongside every approve/reject/suspend — but availability requests use the current verification row for eligibility.
Other existing public medicine search and patient reservation callsites
still filter on `Provider.isVerified` directly. Those callsites need
separate integration before this evaluator can be described as the
source of truth for every pharmacy visibility and reservation decision.

## 11. Live reviewer permission revalidation (and its known limitation)

Every consequential platform mutation calls
`PlatformRepository.findEffectivePlatformPermissions` **immediately
before** its transaction, re-verifying the reviewer still holds
`platform.provider-verifications.review` live from the database — not
trusting the `TrustedPlatformActor`-shaped value alone. **Known
limitation, documented rather than hidden**: this check happens
_before_, not _inside_, the transaction, because the accepted
`PlatformRepository` primitive is not transaction-client-aware; making
it fully atomic with the mutation would require modifying shared
platform infrastructure, which is out of scope for this provisional
candidate. This is a narrow TOCTOU window, not a missing check.

## 12. Platform/tenant permission boundaries

- **`platform.provider-verifications.review`** — new, narrowly-scoped
  platform permission, granted **only to `PLATFORM_OWNER`** (never
  `PLATFORM_ADMIN`), mirroring the accepted Task 0021 precedent that
  `PLATFORM_ADMIN` never receives consequential/"manage"-tier
  permissions.
- **`provider.onboarding.manage`** — new, narrowly-scoped tenant
  permission for pharmacy staff to submit/manage their own
  onboarding, granted to the accepted `TENANT_ADMINISTRATOR` system
  role.
- The tenant `PermissionsGuard` and platform `PlatformPermissionsGuard`
  boundaries are entirely separate — a tenant administrator has no
  path to platform review endpoints regardless of tenant-side
  authority.

## 13. `applicantMessage` vs. internal `verificationNotes`

Split into two separate, explicitly-classified fields:
`verificationNotes` is internal/platform-reviewer-only and is **never**
selected in any pharmacy-facing query. `applicantMessage` is the
bounded (≤500 chars), safely applicant-visible correction/decision
guidance. Reviewer identity is never exposed to the applicant.

## 14. Duplicate-license reviewer signal

`possibleDuplicateLicenseCount` is a **conservative, review-time-only
signal** — never an automatic rejection, never a global uniqueness
constraint (the repository does not carry enough jurisdiction identity
to safely distinguish a true duplicate from legitimate cross-
jurisdiction reuse). Historical rows belonging to the **same** provider
are explicitly excluded from the count (fixed after review — the
original version incorrectly flagged a pharmacy's own renewal history
as a duplicate); a legacy `providerId = NULL` row sharing the license
number is deliberately still counted, since it cannot be attributed
to any specific provider.

## 15. Deterministic pagination

`listReviewQueue` orders by `submittedAt DESC, id DESC` (a fully
unique composite key), with an opaque base64url cursor encoding both
fields and validating the decoded id against the repository's
canonical UUID v4 shape. Verified: same-timestamp rows never skipped
or duplicated across pages; `businessNameSearch` and `status` filters
remain stable across multi-page walks; malformed/incomplete/invalid-
UUID cursors are all rejected.

## 16. Task 0026 integration

Task 0026's `AvailabilityRequestService` callsites were modified with
the minimum necessary change: the raw `isVerified: true` filter was
replaced with a call to the central evaluator. Task 0026's own
architecture, privacy model, and idempotency semantics were not
redesigned.

## 17. Task 0027 preservation

Task 0027's `PharmacyAvailabilityRequestPreference` model, its own
migrations, its `inventory.availability-requests.configure` permission,
and its advisory-lock serialization pattern are all reused, never
duplicated or weakened. Confirmed via direct file diff that Task
0027's own files are untouched by this candidate except for the
`Provider` model's shared relation block (one-line manual merge,
verified).

## 18. Task 0028 preservation

Confirmed via direct file diff (zero delta) that
`AvailabilityRequestDemandAnalyticsService`,
`assertPharmacyProviderAccess`, `InventoryController`'s demand
endpoint, and the demand-query DTO are entirely untouched by this
candidate. `InventoryModule` carries both Task 0028's
`AvailabilityRequestDemandAnalyticsService` and this candidate's
`PharmacyVerificationModule` together.

## 19. Task 0032 audit preservation

Task 0032 added `patient.profile.updated` (metadata: `fieldsChanged`)
to the shared TypeScript audit catalogue and its own DB-level
`AuditEvent_event_type_check`. This candidate's own migration
reconstructs that CHECK constraint (Prisma has no native "extend an
existing CHECK" operation), so after re-anchoring onto Task 0032 this
candidate's reconstruction was corrected to include
`patient.profile.updated` explicitly — never dropping or overwriting
it. Verified directly: the TypeScript catalogue keeps
`patient.profile.updated → ['fieldsChanged']` unchanged; the checked-in DB migration-chain gate exercises preservation of
`patient.profile.updated`; this corrected patch has not run that gate
against a PostgreSQL server.

## 20. Migration and populated-upgrade strategy

Append-only migration (`20260918140000_task_0039_pharmacy_onboarding_verification`),
timestamped after the accepted Task 0032 migration in this base. No accepted migration
was ever edited. Two independent populated-upgrade gates exist:

1. **Synthetic verifier** — a minimal hand-built approximation of the
   pre-0039 schema, fast, focused evidence.
2. **Authoritative-migration-chain verifier** — applies all 34 real
   accepted migration files (via `psql --single-transaction` per file,
   required because several accepted migrations use `CREATE TEMP
TABLE ... ON COMMIT DROP` patterns that break under default
   per-statement autocommit) through the current authoritative base,
   seeds synthetic data through the real schema, then applies this
   candidate's migration and re-verifies every invariant — proving the
   migration works against the actual accepted schema, not an
   approximation.

When run against a disposable PostgreSQL database, these scripts check
historical row preservation, provider linkage, projections, other inventory
rows, permissions and audit event compatibility. The current workspace has
no PostgreSQL service, so those integration gates remain unverified here.

## 21. Evidence and privacy boundaries

- **No document storage is implemented.** `governmentIdReference` is a
  bounded (≤200 char) **opaque reference string only** — never a file
  upload, never a public URL. Production activation of real secure
  document storage is an explicit, separate, out-of-scope
  responsibility for later integration.
- License number, government reference, reviewer identity, and
  internal notes are never exposed through any pharmacy-facing or
  public query.
- No patient-facing API exposes verification evidence at all — only an
  eligible/verified indicator already consistent with Task 0026's
  existing product surface.

## 22. Validation of this corrected patch

TypeScript checks, focused and full unit suites, Prisma schema generation,
production builds, lint and clean patch application are recorded with the
review artifact. The original candidate's historical PostgreSQL PASS claims
are not evidence for this corrected patch. Its migration and concurrency
scripts require `AIM_CANDIDATE_0039_DATABASE_URL` and a disposable database;
no such database was available in this workspace.

## 23. Explicitly out of scope

Task 0027's own control-layer (developed/accepted independently); Task
0028's demand analytics (preserved, not modified); real document/file
upload and storage; external government license-registry integration;
final legal/compliance certification; production deployment; hospital/
clinic verification (schema supports `ProviderType`, but only the
pharmacy flow is implemented); pharmacy staff/role UX (Task 0040);
inventory import (Task 0041); POS (Task 0042); delivery (Task 0043);
WhatsApp/SMS/email provider activation (Task 0046); pharmacy onboarding page UI; this patch supplies pharmacy BFF routes
and backend APIs only.

## 24. Provisional status

This is preservation/reconciliation work only. When any further
authoritative task lands, do not blindly rebase or cherry-pick this
branch — create a fresh reconciliation worktree, classify every delta
against the new base, port only what remains valid, and rerun the
full gate matrix before considering any candidate authoritative.
