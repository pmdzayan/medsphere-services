# ADR-004: Tenant-Safe Authorization and Durable Audit

**Status:** Accepted

**Date:** 2026-07-25

**Decision owners:** MedSphere Project Owner and CTO

**Depends on:** ADR-001, ADR-002, ADR-003

## Context

S0.3 established a trusted `User` → `TenantMembership` → `Tenant` → `UserSession`
identity chain. The remaining RBAC prototype assigns a role directly to a global
user and looks up permissions without a tenant boundary. A person who belongs to
multiple organizations can therefore inherit privileges from the wrong tenant.
The database also permits role/permission relationships that do not prove a
shared tenant.

The existing `AuditLog` is a mutable, unscoped snapshot store. It has no foreign
keys, accepts arbitrary old/new values, cannot prove the actor's tenant
membership, and permits update and delete. Application logs are useful
operational evidence but are not a durable healthcare audit trail.

S0.4 must establish a deny-by-default authorization boundary and an attributable,
append-only event record before inventory or reservation integrity work begins.

## Decision

### Authorization ownership

- A role belongs to exactly one tenant.
- A role assignment belongs to a `TenantMembership`, never directly to a global
  `User`.
- Assignment tables carry `tenantId`. Composite foreign keys prove that the
  membership and role belong to that same tenant.
- Authorization derives `membershipId` and `tenantId` only from the S0.3
  `AuthenticatedIdentity`. Request headers, bodies, paths, and queries cannot
  select the authoritative tenant.
- Permission checks read the current database state on every request. S0.4 does
  not place permissions in JWTs and does not add an authorization cache.
- Missing metadata, unknown permission keys, missing assignments, inactive
  memberships, inactive tenants, soft-deleted roles, or database errors deny
  access.

### Permission catalogue

Permissions are global, immutable capabilities owned by migration history. S0.4
accepts exactly these keys:

| Permission                               | Purpose                                  |
| ---------------------------------------- | ---------------------------------------- |
| `authorization.roles.read`               | Read roles in the active tenant          |
| `authorization.roles.create`             | Create custom tenant roles               |
| `authorization.roles.update`             | Update custom tenant roles               |
| `authorization.roles.delete`             | Soft-delete custom tenant roles          |
| `authorization.permissions.read`         | Read the accepted permission catalogue   |
| `authorization.assignments.read`         | Read membership-role assignments         |
| `authorization.assignments.manage`       | Add or remove membership-role assignments |
| `audit.events.read`                      | Read tenant-scoped audit events           |

The catalogue is inserted by migration with stable identifiers. Runtime startup
does not create roles or permissions. Unknown legacy permission data blocks the
migration for explicit remediation instead of being silently accepted.

### Roles and administrator protection

- `TENANT_ADMINISTRATOR` is the only S0.4 built-in role. It is instantiated
  inside each tenant and receives all eight S0.4 permissions.
- Built-in roles cannot be renamed, retyped, deleted, or have their permissions
  edited through tenant APIs.
- Custom roles can use only catalogue permissions and are always scoped to the
  authenticated tenant.
- Migration does not automatically grant administrator access. Assigning
  elevated healthcare access from historical guesses is unsafe. An explicit,
  reviewed bootstrap or invitation path must make the first assignment.
- The last active tenant-administrator assignment cannot be removed. The
  decision is protected in a serializable transaction with a tenant-version
  write so concurrent removals cannot both succeed.
- Role mutation uses strong `If-Match` version preconditions. Missing,
  malformed, stale, or weak validators are rejected.

### Durable audit model

- `AuditEvent` replaces the unaccepted mutable `AuditLog` prototype.
- Every event has a typed event name, outcome, scope, timestamp, and bounded
  allowlisted metadata object.
- Tenant user events prove the exact actor-user-membership-tenant chain with
  foreign keys. Platform user events may identify the global user without
  attributing the event to one tenant.
- Tenant audit APIs always bind queries to the authenticated tenant and never
  return platform events.
- Audit rows are append-only. A PostgreSQL trigger rejects `UPDATE` and
  `DELETE`, including direct SQL and accidental ORM calls.
- Metadata is limited to a JSON object of at most 16 KiB at the database
  boundary and a lower application limit. Credentials, contact details,
  clinical content, request/response bodies, before/after snapshots, and
  arbitrary payloads are forbidden.
- Security-sensitive state changes write their audit event in the same database
  transaction. If the audit insert fails, the protected mutation rolls back.
- Operational logs remain separate from durable audit events and use only
  allowlisted identifiers.

### Accepted event vocabulary

S0.4 accepts:

- `authorization.role.created`
- `authorization.role.updated`
- `authorization.role.deleted`
- `authorization.assignment.added`
- `authorization.assignment.removed`
- `authorization.permission.denied`
- `authentication.session.created`
- `authentication.session.refresh.succeeded`
- `authentication.session.refresh.failed`
- `authentication.session.refresh.replayed`
- `authentication.session.logout.succeeded`
- `authentication.sessions.logout.succeeded`

Adding event names or metadata keys requires code review and documentation. It
does not require an ADR unless the actor, scope, retention, or trust model
changes.

## Reason

`TenantMembership` is the already accepted representation of a person's access
to one organization. Assigning roles to that aggregate makes the security model
match the domain and supports the same clinician, pharmacist, patient, or
administrator having different responsibilities in different organizations.

Database-enforced tenant equality prevents application bugs, maintenance
scripts, or later modules from creating cross-tenant assignments. A small
migration-owned permission catalogue prevents premature privileges for
inventory, clinical, supplier, delivery, payment, and controlled-medicine
workflows whose rules are not yet accepted.

Append-only typed events provide attributable evidence while minimizing
sensitive data. Atomic writes avoid a dangerous state where a protected change
succeeds without its required evidence.

## Alternatives considered

### Keep roles attached to global users

Rejected. A global assignment cannot represent different responsibilities in
different organizations and enables cross-tenant privilege leakage.

### Put tenant and permission claims in JWTs

Rejected for S0.4. Claims become stale after role changes and complicate
immediate revocation. A future cache or authorization snapshot requires evidence,
fail-closed invalidation, and a separate decision.

### Accept client-provided tenant IDs after authentication

Rejected. Authentication proves who the caller is, not which organization they
may select. Tenant authority must continue to come from the verified membership.

### Let each tenant create arbitrary permission keys

Rejected. Capability names are application contracts, not tenant content.
Arbitrary keys create silent typos, unreviewed privilege surfaces, and policy
drift.

### Seed all future domain permissions now

Rejected. A permission has no safe meaning before its domain policy and APIs are
accepted. Future sprints extend the catalogue through append-only migrations.

### Keep mutable old/new audit snapshots

Rejected. Snapshots encourage storage of personal or clinical data, expand
breach impact, and permit later alteration of evidence.

### Write audit events asynchronously

Rejected for security-sensitive mutations. An outbox can distribute accepted
events later, but the authoritative audit insert remains in the mutation
transaction.

### Automatically grant administrators during migration

Rejected. Historical role names and user associations are not sufficient
evidence for granting powerful access. Bootstrap must be explicit and reviewed.

## Consequences

### Positive

- The same global user can have isolated roles in multiple tenants.
- Cross-tenant assignment corruption is rejected by PostgreSQL.
- Authorization changes take effect immediately without token reissuance.
- Permission growth follows roadmap dependencies.
- Audit evidence is immutable, attributable, bounded, and tenant-isolated.
- Later policy, consent, inventory, supplier, delivery, and payment modules
  receive stable authorization and audit contracts.

### Negative and trade-offs

- Legacy RBAC rows that cannot be mapped unambiguously block deployment.
- No tenant administrator is guessed automatically, so a controlled bootstrap
  procedure is required before tenant administration APIs are usable.
- Database permission reads add per-request latency until measured caching is
  justified.
- Atomic audit writes make the audit table part of protected mutation
  availability.
- Append-only audit correction requires a compensating event, never row edits.
- Retention, legal hold, export, and deletion policy remain future compliance
  work; S0.4 does not claim legal compliance.

## Implementation constraints

- Build from the accepted S0.3 baseline and its documentation handoff.
- Use one forward-only Prisma migration; never edit accepted migrations.
- Migration preflights report counts or categories, never personal data.
- Verify both an empty PostgreSQL 16 database and the supported S0.3 upgrade
  path.
- Preserve the five accepted languages: `en`, `hi`, `ta`, `te`, and `kn`.
- Do not mount provider, product, inventory, reservation, medical-record,
  marketplace, delivery, payment, or controlled-medicine APIs.
- Do not introduce a new service, wildcard permission, hidden superuser,
  tenant-header fallback, runtime seed, or permissive failure mode.
- Controllers use typed DTOs, bounded pagination, UUID validation, OpenAPI
  metadata, and the shared error envelope.
- The full format, database, lint, test, build, security, and code-review gates
  must pass before acceptance.

## Review triggers

Review this decision before:

- adding platform administrators, support impersonation, delegated access, or
  break-glass workflows;
- caching authorization decisions or embedding permissions in credentials;
- adding attribute- or relationship-based policy evaluation;
- allowing tenant-defined permission capabilities;
- exporting, archiving, partitioning, or deleting audit events;
- adding cryptographic signing or external audit storage;
- extracting authorization or audit into an independently deployed service.
