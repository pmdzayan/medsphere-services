# Task 0045 — Compliance Closure: Retention, Legal Hold & Policy Enforcement

**Engineering status:** implemented on the Task 0045 branch.  
**Legal/compliance certification status:** external review required; this document is not legal advice or a certification.

## Purpose

Task 0045 establishes the V1 lifecycle-control boundary required before AIM expands into additional clinical PHI domains. It deliberately separates:

- engineering controls that AIM can enforce in code;
- organization/legal policy values that must be supplied and reviewed by qualified humans;
- data classes that have a safe V1 destructive executor;
- evidence classes that remain retain-only until a reviewed rule and safe executor exist.

AIM does **not** invent statutory retention periods.

## Data-class inventory and execution matrix

The canonical runtime inventory is `COMPLIANCE_DATA_CLASS_CATALOG`.

Global-user data:

- identity profile — retain-only;
- authentication/security — retain-only;
- privacy preferences — subject-request DELETE/ANONYMIZE supported; automatic expiry remains retain-only;
- consent evidence — retain-only and append-only;
- patient profile — retain-only;
- patient notifications — subject-request and retention DELETE/ANONYMIZE supported;
- patient timeline — subject-request and retention DELETE/ANONYMIZE supported.

Tenant/evidence data:

- tenant membership — retain-only;
- audit evidence — retain-only and append-only;
- medicine reservations — retain-only;
- inventory operations — retain-only;
- billing/financial evidence — retain-only.

The database migration repeats this matrix as a trigger. A service bug cannot configure a tenant override for a global-user class or destructive execution for a retain-only class.

## Policy precedence

Policy evaluation is fail-closed:

1. no applicable policy -> DENY and RETAIN;
2. purpose not explicitly allowlisted -> DENY and RETAIN;
3. access checks are non-destructive;
4. an active legal hold overrides DELETE/ANONYMIZE and forces RETAIN;
5. subject-request disposition must exactly match the policy;
6. retention expiry uses the configured expiry disposition.

Global-user data uses the platform baseline policy only. This prevents one tenant from deleting global data that belongs to the same user across other memberships.

Tenant-scoped data may use a tenant override, falling back to the platform baseline.

## Legal holds

Legal holds are scoped to an exact `(tenant, membership, user)` tuple and optional data class.

Controls:

- exact membership/user/tenant composite foreign key;
- bounded reason-code catalogue;
- optional SHA-256 reference digest only — no free-form case narrative;
- idempotent placement;
- ACTIVE -> RELEASED is the only mutable transition;
- released holds cannot be rewritten;
- DELETE is blocked at the database level;
- global-user destructive processing checks active holds across all of the user's tenant memberships.

## Data-subject consequences

`POST /users/me/compliance/disposition-requests` is self-scoped. The client cannot submit a target user, membership, or tenant.

Every request:

- derives identity from the authenticated session;
- evaluates the effective policy;
- applies legal-hold precedence;
- writes an immutable decision;
- performs the supported mutation in the same serializable transaction;
- writes an immutable `ComplianceDispositionJob`;
- emits bounded exact-user audit evidence;
- supports idempotent replay.

No policy decision or job claims deletion/anonymization when the mutation did not commit.

## Consent withdrawal consequences

Consent remains append-only.

Task 0045 makes withdrawal consequential:

- withdrawing `NOTIFICATIONS_RESERVATIONS` disables `wantsReservationNotifications`;
- withdrawing `NOTIFICATIONS_OPERATIONAL` disables `wantsOperationalAlerts`;
- withdrawing location consent has no stored-location delete because AIM does not persist background location state.

The consent event, consequence, and audit event commit atomically. Granting consent never silently opts the user into notifications.

## Retention worker

The one-shot `compliance-retention-worker` processes only explicitly executable automatic-retention classes:

- `PATIENT_NOTIFICATION`;
- `PATIENT_TIMELINE`.

It is bounded by `COMPLIANCE_RETENTION_BATCH_SIZE` (1–100, default 25), applies global legal-hold precedence, and writes decision/job/audit evidence in the same transaction as each permitted mutation.

Scheduling/deployment cadence remains an operations/deployment choice; the executable worker boundary is repository-owned.

## Evidence

The following records are intentionally durable:

- `CompliancePolicy` — versioned, prior revisions superseded rather than rewritten;
- `ComplianceLegalHold` — preservation lifecycle evidence;
- `CompliancePolicyDecisionRecord` — append-only policy decision evidence;
- `ComplianceDispositionJob` — append-only operational execution evidence;
- `AuditEvent` — bounded actor/system evidence.

## Required external review before production claim

A qualified legal/compliance owner must review and approve, for each deployed jurisdiction and organization type:

- policy references and purposes;
- actual retention-day values;
- legal-hold initiation/release authority;
- data-subject request obligations and response timelines;
- whether additional retain-only classes may lawfully become destructive;
- tax/financial retention interaction;
- healthcare-record retention interaction;
- breach/security evidence retention;
- backup archive retention and deletion semantics;
- cross-border/data-residency requirements.

Until that review occurs, AIM may claim that the **engineering controls are implemented**, not that legal compliance has been certified.
