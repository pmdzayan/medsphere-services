# Candidate Task 0032 — Patient Identity, Profile & Dashboard (Pre-0031)

**Status:** PRE-0031 CANDIDATE IMPLEMENTATION — not accepted, not production-ready,
not merge-ready. Do not treat any part of this as Task 0032 completion.

## 1. Starting authoritative SHA

`79f8b225099ea60dcdc4aed4dacc64d46ec57892` (verified as the live tip of
`origin/feature/database-architecture` via `git fetch origin` immediately
before starting; matched the SHA supplied in the assignment exactly, so no
newer accepted HEAD was substituted).

Worktree: `../aim-candidate-0032-patient-profile`
Branch: `cto/candidate-0032-patient-identity-profile-dashboard-pre0031`

## 2. Why this is candidate work

Tasks 0019–0031 are being implemented separately and have not yet
established their final identity/authorization/session architecture. This
work exists so that useful, already-correct pieces (schema reuse decisions,
the self-service profile pattern, the platform-audit-scope choice, the
patient-dashboard shell) can be recovered and ported after 0031 lands,
rather than starting the patient experience from zero at that point.

## 3. Implemented scope

- Backend self-service profile: `GET /patient/profile`, `PATCH /patient/profile`.
- One additive migration (new audit event type only — no new table).
- Frontend: `/patient/dashboard` route with profile view/edit and honest
  "coming soon" states for appointments, prescriptions, and reports.
- Localization: new `patient-profile` i18n catalog (English, Tamil, Urdu),
  registered into the existing modular `i18n-catalogs/` system.
- Tests: 7 backend service tests (identity scoping, mass-assignment
  defense, audit scope), 5 real-PostgreSQL identity-isolation tests, 8
  frontend component tests.

## 4. Architecture reused (no parallel systems introduced)

- **Identity**: `identity.userId` from the existing `CurrentIdentity()`
  decorator / `AuthenticatedIdentity` type — the same global, JWT-verified
  identity used everywhere else in the codebase. No second login identity,
  no new session concept.
- **Profile storage**: the existing `User` model (`firstName`, `lastName`,
  `phone`, `phoneVerifiedAt`, `preferredLanguage`) and `UserPrivacy` model
  (`wantsReservationNotifications`, `hideSensitiveNotifications`). **No new
  PatientProfile table was created** — every field this candidate exposes
  already existed on an accepted model before this work started.
- **Audit**: the existing `AuditWriter.appendPlatformUser` method (already
  present in `packages/database/src/audit.ts`, scope `PLATFORM`, actor
  `PLATFORM_USER`, keyed by a global `platformActorUserId`, never
  tenant-attributed) — not a new audit system.
- **Authentication guard**: the existing global `JwtAuthGuard` (`APP_GUARD`
  in `app.module.ts`) — no new guard, no permission decorator, since a
  self-service "read/write my own record" resource has no RBAC dimension.
- **Frontend**: existing `Card`, `Input`, `Button`, `EmptyState`, `Skeleton`
  primitives from `@/components/platform/primitives`; existing
  `useLanguage()`/`i18n-catalogs/` localization system; existing
  `requestJson`/`ApiError` pattern in `api-client.ts`.

## 5. New schema/API/UI pieces

**Database** (one migration,
`20260902130000_candidate_0032_patient_profile_audit_event`):

- `Permission`/`Product`/etc. — **untouched**.
- `AuditEvent_event_type_check` CHECK constraint rebuilt to add exactly one
  new value, `patient.profile.updated`, alongside all 45 pre-existing
  values (verified programmatically: the migration's list and
  `packages/database/src/audit.ts`'s `AUDIT_EVENT_TYPES` are an exact
  46/46 match — nothing was dropped).
- No new table. No column added to `User` or `UserPrivacy`.

**Backend** (`apps/auth-service/src/patient-profile/`):

- `patient-profile.module.ts`, `.controller.ts`, `.service.ts`
- `dto/patient-profile.dto.ts` — `UpdatePatientProfileDto` explicitly
  whitelists `firstName`, `lastName`, `preferredLanguage`,
  `wantsReservationNotifications`, `hideSensitiveNotifications` only.
  `PatientProfileResponseDto` never includes `passwordHash`,
  `identityVerificationStatus`, `ageVerificationStatus`, session data, or
  any tenant/membership field.
- Wired into `app.module.ts` alongside the existing modules.
- `permission.constants.ts` — **untouched** (no new permission; this
  resource has no RBAC dimension).

**Frontend**:

- `apps/web/src/lib/patient-profile-contract.ts` — types + runtime guard.
- `apps/web/src/lib/api-client.ts` — `getPatientProfile`,
  `updatePatientProfile` (additions only; no existing function changed).
- `apps/web/src/app/api/patient/profile/route.ts` — BFF GET/PATCH, forwards
  to the backend using the existing session-cookie/access-token pattern.
- `apps/web/src/app/patient/layout.tsx` — a deliberately minimal layout
  (session-cookie check only, no `AppShell`). See §9 for the known
  duplication this creates with `apps/web/src/app/(platform)/layout.tsx`.
- `apps/web/src/app/patient/dashboard/page.tsx`
- `apps/web/src/features/patient/patient-dashboard.tsx`,
  `patient-profile-form.tsx`
- `apps/web/src/lib/i18n-catalogs/patient-profile.ts` — new keys only;
  every pre-existing key in every other catalog file is untouched.

## 6. Tests added

**Backend** (`patient-profile.service.spec.ts`, 7 tests): self-read scoped
by `identity.userId`; `NotFoundException` for a missing user (no existence
leak); update scoped exclusively to the caller's own row, proven by
asserting a second seeded user's row is untouched; mass-assignment defense
at the service layer (a DTO object literal smuggling `email`,
`phoneVerifiedAt`, `status`, `id` never reaches the Prisma write); the
privacy relation is only touched when a privacy field is actually supplied;
`appendPlatformUser` is called with no `tenantId`/`actorMembershipId`;
audit metadata carries only field _names_, never the new values themselves.
Type-checked clean; execution blocked by the same sandbox-wide
Prisma-client-generation limitation as every Prisma-touching Jest test
(`ts-jest`/`@prisma/client` resolution failure — this is an environment
constraint, not a defect in the test or the code under test).

**Real PostgreSQL** (`pg-test/candidate-0032-identity-isolation.js`, 5
scenarios, all executed and passing against a real local PostgreSQL 16
instance): self-read; a direct illustration of why a client-supplied ID
would leak cross-user data (contrasted with the real code path, which has
no such parameter); cross-user write rejection (an update scoped to one
user's `identity.userId` leaves a second seeded user's row byte-identical);
non-existent-user lookup returns null, never falls back to another row.

**Frontend** (`patient-dashboard.test.tsx`, 8 tests, all executed and
passing via Vitest): loading state; profile fields render without any
raw `userId`/tenant/membership text visible; safe generic error message on
load failure (no raw exception text); "coming soon" empty states render
with zero fabricated appointment/prescription/report data; editing and
saving submits exactly the three whitelisted fields (asserted via
`Object.keys(submitted)`, explicitly checking `email`/`userId` are absent);
client-side validation blocks an empty first name and never calls the
update endpoint; a `401` from the update call renders a session-expired
message, not a raw error; Tamil and Urdu render text distinct from
English for the dashboard title.

## 7. Known assumptions

- The candidate assumes `identity.userId` will remain the stable, global
  identity key after Tasks 0019–0031 land. If those tasks change what
  `AccessTokenIdentity`/`AuthenticatedIdentity` carries, `PatientProfileService`
  must be re-checked against the new shape.
- The candidate assumes `appendPlatformUser`'s current signature (scope
  `PLATFORM`, actor `PLATFORM_USER`, `platformActorUserId`) is stable. If
  0019–0031 change platform-audit semantics, the single `appendPlatformUser`
  call in `patient-profile.service.ts` is the only place to update.
- `SUPPORTED_LANGUAGE_CODES` in `patient-profile.dto.ts` is a small,
  explicit, duplicated constant (`['en', 'ta', 'ur']`), matching the
  frontend's current `localeOptions`. If a shared package for this list
  emerges from 0019–0031, this is a direct one-line reconciliation point.

## 8. Dependencies on 0019–0031

- None of this candidate's correctness depends on any unmerged 0019–0031
  branch. It was built entirely against the accepted authoritative HEAD.
- The one soft dependency: if 0019–0031 introduces a distinct notion of
  "personal/patient account" separate from "organization membership" at
  the session/token level, `PatientProfileService`'s reliance on
  `identity.userId` alone (ignoring `identity.tenantId`/`membershipId`
  entirely) should be re-verified as still correct under the new model.

## 9. Files most likely to require reconciliation after 0031

- **`apps/web/src/app/login/login-form.tsx`** (NOT modified by this
  candidate): `LoginResponse.context.organizationType` is already returned
  by the accepted `identifyLogin`/`selectOrganizationLogin` contract, but
  the current redirect is unconditionally `router.replace('/dashboard')`
  (the organization-staff dashboard) regardless of organization type. This
  candidate's `/patient/dashboard` route is therefore **not currently
  reachable via the normal login flow** for a personal/NONE-type user —
  there is no code path that redirects them there today. This is a
  deliberate non-change: `login-form.tsx` is shared, security-sensitive
  authentication infrastructure that other parallel agents may be actively
  modifying, and redirect-routing logic is plausibly in scope for a
  dedicated auth/onboarding task rather than this profile/dashboard
  candidate. **Required follow-up**: once 0019–0031 settle the
  personal-account/organization distinction, add a redirect branch (keyed
  on `context.organizationType === 'NONE'` or whatever the accepted
  equivalent becomes) to send personal-account users to `/patient/dashboard`
  instead of `/dashboard`.
- **`apps/web/src/app/patient/layout.tsx`**: duplicates the session-cookie
  verification lines from `apps/web/src/app/(platform)/layout.tsx` rather
  than extracting a shared helper, specifically so this duplication is a
  visible, intentional decision for reconciliation rather than a
  rediscovered accident. If 0019–0031 changes session-cookie verification,
  both files need the same update.
- **`packages/database/src/audit.ts` / the new migration**: if 0019–0031
  also adds audit event types, whichever lands second must rebuild the
  CHECK constraint from the _other_ branch's already-merged list, exactly
  as this migration did relative to the prior accepted state.
- **`apps/auth-service/src/patient-profile/dto/patient-profile.dto.ts`**:
  the `SUPPORTED_LANGUAGE_CODES` duplication noted in §7.

## 10. Exact integration plan once 0031 is accepted

1. Rebase this branch onto the newly-accepted authoritative HEAD.
2. Re-run the full test/type/lint/build chain against the new base.
3. Re-verify `identity.userId` is still the correct, stable scoping key
   for self-service resources under whatever session/identity model 0031
   establishes.
4. Re-check `appendPlatformUser`'s signature and the platform/tenant audit
   scope distinction against any changes 0019–0031 made to audit
   architecture.
5. Resolve the login-redirect gap in §9 (in a task explicitly authorized to
   touch `login-form.tsx`, not this one).
6. Re-run the real-PostgreSQL identity-isolation suite
   (`pg-test/candidate-0032-identity-isolation.js`) against the post-0031
   schema to confirm no regression.
7. Decide whether `apps/web/src/app/patient/layout.tsx`'s duplicated session-check should
   be extracted into a shared helper alongside `apps/web/src/app/(platform)/layout.tsx`.
8. Only after all of the above: propose this as an actual Task 0032
   implementation for CTO review — this document and its commit are not
   that proposal.
