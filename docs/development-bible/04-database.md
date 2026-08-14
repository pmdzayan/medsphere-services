# Volume 04 — Database Bible

**Baseline:** Accepted through G3.22; G3.23 notification-delivery persistence candidate

**Engine:** PostgreSQL 16

**ORM and migration tool:** Prisma 5

**Schema:** `packages/database/prisma/schema.prisma`

**Migration directory:** `packages/database/prisma/migrations`

## Acceptance boundary

This volume documents the accepted database through G3.22. S0.5 established
tenant-scoped batch quantity authority, an append-only
stock ledger, typed medicine reservations, deterministic FEFO allocations, and
idempotent command receipts. G3.1 added composite membership-provider access.
G3.2 added migration-owned permissions and constrained command hashes for the
first accepted stock mutations. Later accepted sprints added reservation
lifecycle, transfer, damage, physical-expiry, and quarantine evidence. G3.16
adds a dedicated migration-owned staff-creation permission while reusing the
accepted reservation tables and invariants. G3.21 added the transactional
outbox and inbox receipt, and G3.22 added atomic inventory producers without a
schema change. G3.23 proposes a separate provider-neutral notification-delivery
queue and append-only attempt evidence. Consent, privacy, retention, and
remaining product domains continue through dependency-ordered sprints.

No production or real healthcare data is approved.

## Migration chain

| Order | Migration                                                        | Purpose                                                                |
| ----: | ---------------------------------------------------------------- | ---------------------------------------------------------------------- |
|     1 | `20260715163416_init_auth_schema`                                | Tenant, user, session, role, permission, and assignment foundation     |
|     2 | `20260720020000_complete_reproducible_baseline`                  | Additive migration from the auth state to the complete declared schema |
|     3 | `20260720120000_trusted_authentication_tenant_context`           | Global identity, tenant memberships, and secure rotated sessions       |
|     4 | `20260725120000_tenant_safe_authorization_durable_audit`         | Membership RBAC, global permissions, and append-only audit events      |
|     5 | `20260731120000_inventory_ledger_medicine_reservation_integrity` | Tenant-safe batches, ledger, reservations, and command receipts        |
|     6 | `20260801000000_align_medicine_reservation_command_fk_name`      | Repair reservation command foreign-key naming                          |
|     7 | `20260802120000_trusted_provider_stock_read`                     | Trusted provider assignments and inventory-read permission             |
|     8 | `20260802160000_inventory_stock_commands`                        | Stock command hashes and listing/receipt/adjust permissions            |
|     9 | `20260802180000_provider_reservation_operations`                 | Provider reservation read/manage permissions                           |
|    10 | `20260808210000_session_credential_integrity`                    | Session credential integrity constraints                               |
|    11 | `20260809160000_completed_inventory_transfer`                    | Completed transfer evidence and audit                                  |
|    12 | `20260810140000_completed_damaged_stock_write_off`               | Damage write-off evidence and audit                                    |
|    13 | `20260810180000_physical_batch_expiry_reconciliation`            | Physical expiry evidence and system audit                              |
|    14 | `20260810200000_one_way_manual_batch_quarantine`                 | Terminal quarantine evidence, permission, and audit                    |
|    15 | `20260814120000_staff_reservation_creation`                      | Assigned-provider staff reservation creation permission                |
|    16 | `20260814180000_transactional_event_delivery_foundation`         | Tenant outbox, leased relay state, and inbox deduplication             |
|    17 | `20260814220000_notification_delivery_foundation`                | Opaque-recipient notification queue and append-only attempt evidence   |

Migration history is append-only under ADR-002. Applied migrations are never edited or deleted. Shared databases use `prisma migrate deploy`; `prisma db push` is prohibited.

## Reproducibility commands

```bash
pnpm db:validate
pnpm db:deploy
pnpm db:status
pnpm db:drift
pnpm db:verify
```

`db:verify` requires `DATABASE_URL`, deploys the full chain, checks status, and compares the live database with the schema. Pull requests run it against a clean PostgreSQL 16 service.

## Enum catalogue

| Enum                         | Values                                                                                                                                           |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `UserStatus`                 | `ACTIVE`, `INACTIVE`, `SUSPENDED`, `PENDING_VERIFICATION`                                                                                        |
| `SessionStatus`              | `ACTIVE`, `ROTATED`, `EXPIRED`, `REVOKED`, `COMPROMISED`                                                                                         |
| `MembershipStatus`           | `PENDING`, `ACTIVE`, `SUSPENDED`, `REVOKED`                                                                                                      |
| `AuditActorType`             | `TENANT_USER`, `PLATFORM_USER`, `SYSTEM`                                                                                                         |
| `AuditScope`                 | `TENANT`, `PLATFORM`                                                                                                                             |
| `AuditOutcome`               | `SUCCEEDED`, `DENIED`, `FAILED`                                                                                                                  |
| `ProviderType`               | `PHARMACY`, `HOSPITAL`                                                                                                                           |
| `VerificationStatus`         | `PENDING`, `UNDER_REVIEW`, `APPROVED`, `REJECTED`, `SUSPENDED`, `EXPIRED`                                                                        |
| `ProductCategory`            | `MEDICINE`, `OTC`, `COSMETIC`, `AYURVEDIC`, `SUPPLEMENT`, `BABY_CARE`, `PERSONAL_CARE`, `MEDICAL_DEVICE`                                         |
| `DosageForm`                 | `TABLET`, `SYRUP`, `INJECTION`, `CREAM`, `OINTMENT`, `CAPSULE`, `DROPS`, `INHALER`, `SPRAY`, `LOTION`, `GEL`, `POWDER`, `SOLUTION`, `SUSPENSION` |
| `RoleType`                   | `SYSTEM`, `TENANT`                                                                                                                               |
| `BatchStatus`                | `ACTIVE`, `EXPIRED`, `EXHAUSTED`, `QUARANTINED`                                                                                                  |
| `BatchQuarantineReason`      | `QUALITY_SUSPECT`, `TEMPERATURE_EXCURSION`, `PACKAGING_COMPROMISED`, `STORAGE_DEVIATION`                                                         |
| `StockMovementType`          | `STOCK_IN`, `STOCK_OUT`, `ADJUSTMENT`, `TRANSFER_IN`, `TRANSFER_OUT`, `RETURN`, `RETURN_IN`, `RETURN_OUT`, `EXPIRED`, `DAMAGED`                  |
| `MedicalRecordType`          | `PRESCRIPTION`, `LAB_REPORT`, `XRAY`, `MRI`, `CT_SCAN`, `VACCINATION`, `DISCHARGE_SUMMARY`, `INSURANCE`, `OTHER`                                 |
| `ReservationType`            | `MEDICINE_PICKUP`, `HOSPITAL_APPOINTMENT`, `LAB_TEST`, `VACCINATION`                                                                             |
| `ReservationStatus`          | `PENDING`, `CONFIRMED`, `READY`, `COMPLETED`, `CANCELLED`, `EXPIRED`                                                                             |
| `OutboxEventStatus`          | `PENDING`, `PROCESSING`, `FAILED`, `DELIVERED`, `DEAD_LETTER`                                                                                    |
| `NotificationChannel`        | `EMAIL`, `SMS`, `WHATSAPP`, `PUSH`                                                                                                               |
| `NotificationRecipientType`  | `TENANT_MEMBERSHIP`, `TENANT_OPERATIONAL_ROUTE`                                                                                                  |
| `NotificationDeliveryStatus` | `PENDING`, `PROCESSING`, `FAILED`, `DELIVERED`, `DEAD_LETTER`                                                                                    |
| `NotificationAttemptOutcome` | `DELIVERED`, `FAILED`, `DEAD_LETTER`                                                                                                             |

## Provisional model ownership

| Module                     | Models                                                             | Current acceptance                                 |
| -------------------------- | ------------------------------------------------------------------ | -------------------------------------------------- |
| Tenancy and Identity       | `Tenant`, `User`, `TenantMembership`, `UserPrivacy`, `UserSession` | S0.3 accepted; S0.4 session audit accepted         |
| Access Control             | `Role`, `Permission`, `MembershipRole`, `RolePermission`           | S0.4 accepted with PostgreSQL integration evidence |
| Provider Registry          | `Provider`, `ProviderVerification`                                 | Prototype; verification workflow blocked           |
| Medicine Catalog           | `Product`                                                          | Prototype                                          |
| Inventory and Stock Ledger | `Inventory`, `Batch`, `StockMovement`, `InventoryHistory`          | S0.5 redesign active under ADR-005                 |
| Audit and Policy           | `AuditEvent`                                                       | S0.4 accepted with PostgreSQL integration evidence |
| Patient Records            | `MedicalRecord`                                                    | Blocked by authentication, consent, and privacy    |
| Reservation and Fulfilment | `Reservation`                                                      | S0.5 replacement active under ADR-005              |
| Event Delivery             | `OutboxEvent`, `EventInboxReceipt`                                 | G3.21 accepted under ADR-013                       |
| Notification Delivery      | `NotificationDelivery`, `NotificationDeliveryAttempt`              | G3.23 candidate under proposed ADR-015             |

### G3.23 notification-delivery candidate

`NotificationDelivery` stores one tenant-scoped, idempotent delivery intent
for an accepted source event, workflow, opaque recipient reference, and channel.
Its template variables are bounded and privacy-validated. Plaintext contact
destinations and rendered bodies are not persisted. Workers coordinate through
bounded leases and a constrained retry/dead-letter state machine.

`NotificationDeliveryAttempt` is append-only evidence for one claimed attempt.
It stores only the attempt number, coded outcome, provider key, optional hashed
provider reference, and occurrence time. Raw provider errors, provider payloads,
credentials, destinations, variables, and message bodies are prohibited.

Ownership is provisional until bounded-context and persistence-boundary work is accepted. Existing service folders do not establish ownership.

## S0.5 target model

ADR-005 accepts the following target. It is not implemented or database-
accepted until the forward migration and infrastructure gates pass.

| Target model                            | Authority and purpose                                                             |
| --------------------------------------- | --------------------------------------------------------------------------------- |
| `Inventory`                             | One tenant/provider/product listing; commercial and visibility configuration only |
| `Batch`                                 | Sole mutable on-hand and held quantity state; expiry and lot identity             |
| `StockMovement`                         | Append-only, tenant-scoped on-hand ledger with signed delta and idempotency       |
| `MedicineReservation`                   | Provider-scoped medicine hold header and lifecycle                                |
| `MedicineReservationItem`               | Typed product and requested quantity                                              |
| `MedicineReservationAllocation`         | Exact FEFO batch hold, release, or consumption                                    |
| legacy `InventoryHistory`/`Reservation` | Removed only through verified forward migration; ambiguous data blocks deployment |

Required database invariants include non-negative on-hand and held quantities,
held quantity not exceeding on-hand quantity, movement arithmetic equality,
same-tenant composite foreign keys, deterministic uniqueness, immutable
movement rows, explicit reservation transitions, and tenant-scoped idempotency.

### G3.10 physical batch expiry evidence

`BatchExpiryRecord` is the one-per-batch, append-only proof that a due physical
batch was marked unusable. Composite foreign keys bind tenant, inventory,
provider, product, and batch scope. It records the original expiry date,
unchanged on-hand quantity, resulting batch version, and one database-authority
timestamp used for both reconciliation and creation. Expiry changes no physical
quantity and therefore creates no `StockMovement`.

### G3.11 one-way batch quarantine evidence

`BatchQuarantineRecord` is the one-per-batch, append-only proof of an assigned
staff quarantine command. Composite foreign keys bind tenant, inventory,
provider, product, batch, and actor membership scope. It records a bounded
reason, unchanged on-hand quantity, affected reservation and released-unit
counts, idempotency hash, resulting batch version, and database-authority time.
Quarantine releases all reservation holds but changes no physical quantity and
therefore creates no `StockMovement`.

## Table catalogue

Types below describe the PostgreSQL representation. Columns are required unless marked nullable (`?`). Prisma-managed `updatedAt` values are application-generated during Prisma updates, not database triggers.

### `Tenant`

- Columns: `id UUID PK`; `name text`; normalized `slug text unique`; `email text? unique`; `isActive boolean=true`; `selfRegistrationEnabled boolean=false`; `version integer=1`; `createdAt timestamp=now`; `updatedAt timestamp`; `deletedAt timestamp?`.
- Relationships: parent of memberships, roles, tenant audit events, provider verifications, and providers.
- Constraints: unique slug and optional email; normalized lowercase-hyphen slug check in the S0.3 migration.
- Indexes: unique `slug`; unique `email`; `slug` index.
- Sensitive/audit notes: email may be personal or organizational contact data. Public onboarding is denied by default. Soft deletion exists; retention policy is not accepted.

### `User`

- Columns: `id UUID PK`; `email citext global unique`; `passwordHash text`; `firstName text`; `lastName text`; `phone text?`; `preferredLanguage text='en'`; `status UserStatus=ACTIVE`; `version integer=1`; `createdAt timestamp=now`; `updatedAt timestamp`; `deletedAt timestamp?`.
- Relationships: global identity parent of memberships, platform audit events, and one privacy record.
- Constraints: case-insensitive global unique email.
- Indexes: unique `email`.
- Migration behavior: normalized duplicate emails stop the migration without exposing email values; no automatic identity merge occurs.
- Sensitive/audit notes: identity and authentication data. Passwords use explicitly configured Argon2id. Soft-delete/retention behavior remains unaccepted.

### `TenantMembership`

- Columns: `id UUID PK`; `tenantId UUID`; `userId UUID`; `status MembershipStatus=PENDING`; `isDefault boolean=false`; `joinedAt timestamp?`; `endedAt timestamp?`; `version integer=1`; `createdAt timestamp=now`; `updatedAt timestamp`; `deletedAt timestamp?`.
- Relationships: joins global `User` to `Tenant`; parent of sessions,
  membership-role assignments, and attributable tenant audit events.
- Constraints: `tenantId → Tenant.id` delete restrict; `userId → User.id`
  cascade delete; unique `(tenantId, userId)`; candidate key `(id, tenantId)`;
  partial unique default membership per non-deleted user.
- Indexes: `(userId, status)`; `(tenantId, status)`; unique tenant/user; unique
  identifier/tenant; partial unique default.
- Migration behavior: one deterministic default membership is backfilled from every S0.2 tenant-bound user. Status maps conservatively; ambiguous global emails abort instead of merging.
- Security note: this is the authoritative tenant context for authentication
  and authorization. Composite foreign keys use `(id, tenantId)` to prove
  assignment and audit actor scope.

### `UserPrivacy`

- Columns: `id UUID PK`; `userId UUID unique`; `sharePhone boolean=false`; `shareEmail boolean=false`; `allowInAppChat boolean=true`; `privatePickup boolean=false`; `hideSensitiveNotifications boolean=true`; `preferredLanguage text='en'` (legacy, non-authoritative, not exposed by accepted APIs; removal requires a reviewed data migration); `version integer=1`; `createdAt timestamp=now`; `updatedAt timestamp`.
- Relationships: belongs one-to-one to `User`.
- Constraints: foreign key `userId → User.id` with cascade delete; unique `userId`.
- Indexes: unique `userId`; `userId` index.
- Acceptance note: these preferences are not a substitute for purpose-specific medical consent. Consent Management remains blocked.

### `Role`

- Columns: `id UUID PK`; `tenantId UUID`; `name text`; `description text?`; `type RoleType=TENANT`; `version integer=1`; `createdAt timestamp=now`; `updatedAt timestamp`; `deletedAt timestamp?`.
- Relationships: belongs to `Tenant`; parent of membership-role and
  role-permission assignments.
- Constraints: foreign key `tenantId → Tenant.id` with delete restrict; unique
  `(tenantId, name)`; candidate key `(id, tenantId)`; built-in shape check
  permits only non-deleted `SYSTEM/TENANT_ADMINISTRATOR` or non-reserved
  `TENANT` roles.
- Indexes: `tenantId`; composite unique tenant/name and identifier/tenant.
- Security note: built-in roles are immutable through the accepted API. Custom
  role names remain reserved after soft deletion so historical identifiers are
  not silently reused.

### `Permission`

- Columns: `id UUID PK`; `name varchar(120)`; `description varchar(240)`;
  `createdAt timestamp=now`.
- Relationships: global capability catalogue; parent of role-permission
  assignments.
- Constraints: global unique name. A database trigger rejects runtime
  `INSERT`, `UPDATE`, and `DELETE`; future catalogue changes require a reviewed
  forward migration.
- Catalogue: exactly the eight keys recorded in ADR-004, with deterministic
  migration-owned UUIDs.

### `MembershipRole`

- Columns: `id UUID PK`; `tenantId UUID`; `membershipId UUID`; `roleId UUID`;
  `createdAt timestamp=now`.
- Relationships: joins one tenant membership to one role in the same tenant.
- Constraints: composite
  `(membershipId, tenantId) → TenantMembership(id, tenantId)` cascade delete;
  composite `(roleId, tenantId) → Role(id, tenantId)` delete restrict; unique
  `(membershipId, roleId)`.
- Indexes: `(tenantId, membershipId)`; `(tenantId, roleId)`; unique
  membership/role.
- Security note: PostgreSQL, rather than application convention, rejects
  cross-tenant role assignments.

### `RolePermission`

- Columns: `id UUID PK`; `tenantId UUID`; `roleId UUID`; `permissionId UUID`;
  `createdAt timestamp=now`.
- Relationships: joins a tenant role to one global permission.
- Constraints: composite `(roleId, tenantId) → Role(id, tenantId)` cascade
  delete; `permissionId → Permission.id` delete restrict; unique
  `(roleId, permissionId)`.
- Indexes: `(tenantId, roleId)`; `permissionId`; unique role/permission.
- Security note: the redundant tenant key proves the role boundary and prevents
  a caller from relabeling a foreign role mapping.

### `UserSession`

- Columns: `id UUID PK`; `userId UUID`; `tenantId UUID`; `membershipId UUID`; `familyId UUID`; `refreshTokenHash varchar(64) unique`; `ipAddress inet?`; `userAgent varchar(512)?`; `deviceName varchar(120)?`; `expiresAt timestamp`; `absoluteExpiresAt timestamp`; `lastUsedAt timestamp=now`; `status SessionStatus=ACTIVE`; `replacedById UUID? unique`; `version integer=1`; `revokedAt timestamp?`; `revocationReason varchar(120)?`; `createdAt timestamp=now`; `updatedAt timestamp`.
- Relationships: belongs to `User`, `Tenant`, and `TenantMembership`; optional self-reference to the rotation successor; parent of credential history.
- Constraints: composite `(membershipId, userId, tenantId) → TenantMembership(id, userId, tenantId)` cascade delete; direct user and tenant foreign keys; `replacedById → UserSession.id` set null; unique digest and successor reference; `version >= 1`.
- Indexes: `(userId, status)`; `(tenantId, status)`; `(membershipId, status)`; `(familyId, status)`; `(familyId, createdAt)`; `(status, expiresAt)`; `(status, absoluteExpiresAt)`; unique digest and successor.
- Migration behavior: AG-02A backfills the direct identity tuple from the authoritative membership and fails closed if a session cannot be resolved.
- Sensitive/audit notes: only a peppered HMAC digest is stored. Device and network metadata remain sensitive and require an accepted retention policy.

### `UserSessionRefreshCredential`

- Columns: `id UUID PK`; `sessionId UUID`; `hash varchar(64) unique`; `status RefreshCredentialStatus=ACTIVE`; `issuedAt timestamp=now`; `usedAt timestamp?`; `revokedAt timestamp?`; `replacedById UUID? unique`; `rotationSequence integer=1`; `createdAt timestamp=now`.
- Relationships: belongs to `UserSession`; optional self-reference to the successor credential.
- Constraints: session cascade delete; successor set null; `rotationSequence >= 1`; exact state/timestamp shape; partial unique index allowing at most one active credential per session.
- Indexes: unique hash; `(sessionId, status)`; `(sessionId, issuedAt)`; `(status, issuedAt)`; partial unique active-per-session.
- Migration behavior: existing `ACTIVE` sessions become active credentials, `ROTATED` sessions become used credentials with `usedAt`, and terminal sessions become revoked credentials with `revokedAt`.
- Security note: only HMAC-SHA-256 digests are persisted. Unknown hashes are invalid, while reuse of a known used hash is confirmed replay and compromises the session family.

### `ProviderVerification`

- Columns: `id UUID PK`; `tenantId UUID`; `providerType ProviderType`; `status VerificationStatus=PENDING`; `licenseNumber text`; `licenseExpiryDate timestamp`; `businessRegistrationNumber text`; `governmentIdReference text`; `verificationNotes text?`; `submittedAt timestamp=now`; `verifiedAt timestamp?`; `verifiedBy UUID?`; `version integer=1`; `createdAt timestamp=now`; `updatedAt timestamp`; `deletedAt timestamp?`.
- Relationships: belongs to `Tenant`.
- Constraints: `tenantId → Tenant.id` delete restrict.
- Indexes: `tenantId`; `status`; `providerType`.
- Sensitive/audit notes: license and government-reference data require access, encryption, retention, and verification controls. `verifiedBy` has no foreign key yet.

### `Provider`

- Columns: `id UUID PK`; `tenantId UUID`; `providerType ProviderType`; `businessName text`; `ownerName text`; `email text`; `phone text`; `address text`; `city text`; `state text`; `country text`; `postalCode text`; `latitude double`; `longitude double`; `geoHash text?`; `isVerified boolean=false`; `isActive boolean=true`; `version integer=1`; `createdAt timestamp=now`; `updatedAt timestamp`; `deletedAt timestamp?`.
- Relationships: belongs to `Tenant`; parent of inventory and batches.
- Constraints: `tenantId → Tenant.id` delete restrict.
- Indexes: `tenantId`; `providerType`; `email`.
- Sensitive/audit notes: contact and precise-location data require privacy and verification controls. `isVerified` must not become an ungoverned bypass flag.

### `Product`

- Columns: `id UUID PK`; `name text`; `genericName text?`; `brand text`; `category ProductCategory`; `subCategory text?`; `description text?`; `manufacturer text`; `dosageForm DosageForm`; `strength text`; `barcode text?`; `requiresPrescription boolean=false`; `isActive boolean=true`; `version integer=1`; `createdAt timestamp=now`; `updatedAt timestamp`; `deletedAt timestamp?`.
- Relationships: parent of inventory and batches.
- Indexes: `category`; `name`; `barcode`.
- Acceptance note: universal medicine taxonomy, uniqueness, localization, and controlled-medicine rules remain future work.

### `Inventory`

- Columns: `id UUID PK`; `providerId UUID`; `productId UUID`; `sku text?`; `batchNumber text`; `expiryDate timestamp`; `quantity integer`; `reservedQuantity integer=0`; `sellingPrice decimal(10,2)`; `mrp decimal(10,2)`; `discountPercentage decimal(5,2)`; `taxPercentage decimal(5,2)`; `minimumStockLevel integer=10`; `inStock boolean=true`; `isVisible boolean=true`; `version integer=1`; `createdAt timestamp=now`; `updatedAt timestamp`; `deletedAt timestamp?`.
- Relationships: belongs to `Provider` and `Product`; parent of stock movements.
- Constraints: `providerId → Provider.id` cascade delete; `productId → Product.id` delete restrict.
- Indexes: `providerId`; `productId`; `expiryDate`; `(providerId, inStock)`.
- Rejected invariants: quantities, price ranges, batch uniqueness, reservation atomicity, and the competing `Batch` source of truth are not accepted. S0.5 owns redesign.

### `Batch`

- Columns: `id UUID PK`; `providerId UUID`; `productId UUID`; `batchNumber text`; `manufacturingDate timestamp?`; `expiryDate timestamp`; `initialQuantity integer`; `currentQuantity integer`; `purchasePrice decimal(10,2)`; `sellingPrice decimal(10,2)`; `status BatchStatus=ACTIVE`; `version integer=1`; `createdAt timestamp=now`; `updatedAt timestamp`; `deletedAt timestamp?`.
- Relationships: belongs to `Provider` and `Product`; optional parent of stock movements.
- Constraints: `providerId → Provider.id` cascade delete; `productId → Product.id` delete restrict; unique `(providerId, productId, batchNumber)`.
- Indexes: `providerId`; `productId`; `expiryDate`; `status`; composite unique batch identity.
- Rejected invariants: non-negative quantities, manufacturing/expiry ordering, price ranges, and canonical stock ownership remain S0.5 work.

### `StockMovement`

- Columns: `id UUID PK`; `inventoryId UUID`; `batchId UUID?`; `providerId UUID`; `productId UUID`; `type StockMovementType`; `quantity integer`; `quantityBefore integer`; `quantityAfter integer`; `referenceType text?`; `referenceId text?`; `reason text?`; `notes text?`; `userId UUID`; `version integer=1`; `createdAt timestamp=now`; `updatedAt timestamp`; `deletedAt timestamp?`.
- Relationships: belongs to `Inventory`; optionally belongs to `Batch`.
- Constraints: `inventoryId → Inventory.id` delete restrict; `batchId → Batch.id` delete restrict.
- Indexes: `inventoryId`; `batchId`; `providerId`; `productId`; `type`; `createdAt`.
- Gaps: provider, product, and user identifiers are not foreign keys; immutable-ledger rules and quantity equations are absent. S0.5 owns these controls.

### `InventoryHistory`

- Columns: `id UUID PK`; `inventoryId UUID`; `providerId UUID`; `productId UUID`; `batchId UUID?`; `type StockMovementType`; `quantity integer`; `quantityBefore integer`; `quantityAfter integer`; `referenceType text?`; `referenceId text?`; `reason text?`; `notes text?`; `userId UUID`; `createdAt timestamp=now`.
- Relationships: no database foreign keys are declared.
- Indexes: `inventoryId`; `providerId`; `productId`; `batchId`; `type`; `createdAt`.
- Gap: this competes with `StockMovement` as history. S0.5 must choose one authoritative ledger and preserve required evidence before deletion.

### `AuditEvent`

- Columns: `id UUID PK`; `scope AuditScope`; `actorType AuditActorType`;
  `outcome AuditOutcome`; `tenantId UUID?`; `actorMembershipId UUID?`;
  `platformActorUserId UUID?`; `eventType varchar(120)`; paired
  `resourceType varchar(80)?` and `resourceId varchar(120)?`;
  `requestId varchar(120)?`; `ipAddress inet?`; `userAgent varchar(512)?`;
  `metadata jsonb`; `occurredAt timestamp=now`.
- Relationships: tenant events reference `Tenant`; tenant-user events use the
  composite membership/tenant foreign key; platform-user events reference the
  global `User`.
- Constraints: actor/scope shape; paired resource fields; JSON object; maximum
  16 KiB metadata; exact event vocabulary. A trigger rejects every `UPDATE`
  and `DELETE`.
- Indexes: stable tenant cursor `(tenantId, occurredAt DESC, id DESC)`;
  tenant/event/time; actor/time; platform actor/time; resource/time.
- Sensitive/audit notes: application writes accept only event-specific,
  bounded scalar metadata and reject credentials, contact data, clinical
  content, bodies, snapshots, and arbitrary payloads. Tenant APIs select only
  response fields and never return platform events.

### `MedicalRecord`

- Columns: `id UUID PK`; `userId UUID`; `recordType MedicalRecordType`; `title text`; `description text?`; `fileUrl text`; `fileName text`; `fileSize integer`; `mimeType text`; `recordDate timestamp`; `uploadedAt timestamp=now`; `version integer=1`; `createdAt timestamp=now`; `updatedAt timestamp`; `deletedAt timestamp?`.
- Relationships: no database foreign key is declared.
- Indexes: `userId`; `recordType`.
- Sensitive/audit notes: highly sensitive health data. Storage, malware scanning, consent, authorization, encryption, retention, deletion, and audit controls are not accepted; endpoints remain blocked.

### `Reservation`

- Columns: `id UUID PK`; `userId UUID`; `providerId UUID`; `reservationType ReservationType`; `status ReservationStatus=PENDING`; `scheduledAt timestamp`; `notes text?`; `version integer=1`; `createdAt timestamp=now`; `updatedAt timestamp`; `deletedAt timestamp?`.
- Relationships: no database foreign keys are declared.
- Indexes: `userId`; `providerId`; `status`; `scheduledAt`.
- Gap: reservation lines, quantities, expiry, state-transition constraints, idempotency, tenant scope, and inventory atomicity are absent. S0.5 owns medicine reservation integrity.

## Cross-cutting gaps and future migrations

The following are deliberately documented rather than silently accepted:

- G3.2 real PostgreSQL migration, upgrade, command atomicity, replay, and
  concurrency evidence remains mandatory before acceptance.
- Reservation HTTP exposure and automated expiry processing remain unaccepted.
- Transfer, return, damage, quarantine, recall, and location modeling are not
  implemented.
- Audit retention, legal hold, archival, export, partitioning, correction
  events, and cryptographic signing remain future compliance work.
- Consent, purpose, retention, legal hold, archival, and deletion rules are not modeled.
- Country and data-residency partitioning are not designed.
- Permission catalogue extensions are migration-owned; broader taxonomy and
  bootstrap data still require reviewed, idempotent specifications.

These gaps must be resolved through forward migrations in their assigned sprint. Reproducibility is not permission to skip their dependencies.

## Migration review checklist

Every future database change must document:

- owning module and tenant scope;
- columns, types, nullability, defaults, and enum evolution;
- primary, foreign, unique, and check constraints;
- query-driven indexes and redundant-index review;
- destructive or locking operations;
- existing-data backfill and compatibility window;
- rollback or forward-fix procedure;
- privacy, retention, audit, and deletion effects;
- clean-database deployment and drift evidence;
- tests for constraints, transactions, concurrency, and tenant isolation where applicable.
