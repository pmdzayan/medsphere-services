# Volume 04 — Database Bible

**Baseline:** S0.2 reproducible database baseline plus S0.3 trusted-auth migration accepted

**Engine:** PostgreSQL 16

**ORM and migration tool:** Prisma 5

**Schema:** `packages/database/prisma/schema.prisma`

**Migration directory:** `packages/database/prisma/migrations`

## Acceptance boundary

This volume documents the database shape that the repository can reproduce. It does not mark every model as safe or feature-complete. Authentication, tenant enforcement, RBAC/audit integration, inventory integrity, consent, privacy, and retention remain subject to their dependency-ordered stabilization sprints.

No production or real healthcare data is approved.

## Migration chain

| Order | Migration                                              | Purpose                                                                |
| ----: | ------------------------------------------------------ | ---------------------------------------------------------------------- |
|     1 | `20260715163416_init_auth_schema`                      | Tenant, user, session, role, permission, and assignment foundation     |
|     2 | `20260720020000_complete_reproducible_baseline`        | Additive migration from the auth state to the complete declared schema |
|     3 | `20260720120000_trusted_authentication_tenant_context` | Global identity, tenant memberships, and secure rotated sessions       |

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

| Enum                 | Values                                                                                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `UserStatus`         | `ACTIVE`, `INACTIVE`, `SUSPENDED`, `PENDING_VERIFICATION`                                                                                        |
| `SessionStatus`      | `ACTIVE`, `ROTATED`, `EXPIRED`, `REVOKED`, `COMPROMISED`                                                                                         |
| `MembershipStatus`   | `PENDING`, `ACTIVE`, `SUSPENDED`, `REVOKED`                                                                                                      |
| `AuditAction`        | `CREATE`, `UPDATE`, `DELETE`, `ACCESS`                                                                                                           |
| `ProviderType`       | `PHARMACY`, `HOSPITAL`                                                                                                                           |
| `VerificationStatus` | `PENDING`, `UNDER_REVIEW`, `APPROVED`, `REJECTED`, `SUSPENDED`, `EXPIRED`                                                                        |
| `ProductCategory`    | `MEDICINE`, `OTC`, `COSMETIC`, `AYURVEDIC`, `SUPPLEMENT`, `BABY_CARE`, `PERSONAL_CARE`, `MEDICAL_DEVICE`                                         |
| `DosageForm`         | `TABLET`, `SYRUP`, `INJECTION`, `CREAM`, `OINTMENT`, `CAPSULE`, `DROPS`, `INHALER`, `SPRAY`, `LOTION`, `GEL`, `POWDER`, `SOLUTION`, `SUSPENSION` |
| `RoleType`           | `SYSTEM`, `TENANT`                                                                                                                               |
| `BatchStatus`        | `ACTIVE`, `EXPIRED`, `EXHAUSTED`                                                                                                                 |
| `StockMovementType`  | `STOCK_IN`, `STOCK_OUT`, `ADJUSTMENT`, `TRANSFER_IN`, `TRANSFER_OUT`, `RETURN`, `RETURN_IN`, `RETURN_OUT`, `EXPIRED`, `DAMAGED`                  |
| `MedicalRecordType`  | `PRESCRIPTION`, `LAB_REPORT`, `XRAY`, `MRI`, `CT_SCAN`, `VACCINATION`, `DISCHARGE_SUMMARY`, `INSURANCE`, `OTHER`                                 |
| `ReservationType`    | `MEDICINE_PICKUP`, `HOSPITAL_APPOINTMENT`, `LAB_TEST`, `VACCINATION`                                                                             |
| `ReservationStatus`  | `PENDING`, `CONFIRMED`, `READY`, `COMPLETED`, `CANCELLED`, `EXPIRED`                                                                             |

`AuditAction` is declared but `AuditLog.action` is currently free text. S0.4 must reconcile the accepted audit vocabulary rather than assuming the enum is enforced.

## Provisional model ownership

| Module                     | Models                                                             | Current acceptance                              |
| -------------------------- | ------------------------------------------------------------------ | ----------------------------------------------- |
| Tenancy and Identity       | `Tenant`, `User`, `TenantMembership`, `UserPrivacy`, `UserSession` | S0.3 implementation under review                |
| Access Control             | `Role`, `Permission`, `UserRole`, `RolePermission`                 | Reproducible; tenant-safe RBAC rejected         |
| Provider Registry          | `Provider`, `ProviderVerification`                                 | Prototype; verification workflow blocked        |
| Medicine Catalog           | `Product`                                                          | Prototype                                       |
| Inventory and Stock Ledger | `Inventory`, `Batch`, `StockMovement`, `InventoryHistory`          | Reproducible prototype; integrity rejected      |
| Audit and Policy           | `AuditLog`                                                         | Storage prototype; integration rejected         |
| Patient Records            | `MedicalRecord`                                                    | Blocked by authentication, consent, and privacy |
| Reservation and Fulfilment | `Reservation`                                                      | Reproducible prototype; workflow rejected       |

Ownership is provisional until bounded-context and persistence-boundary work is accepted. Existing service folders do not establish ownership.

## Table catalogue

Types below describe the PostgreSQL representation. Columns are required unless marked nullable (`?`). Prisma-managed `updatedAt` values are application-generated during Prisma updates, not database triggers.

### `Tenant`

- Columns: `id UUID PK`; `name text`; normalized `slug text unique`; `email text? unique`; `isActive boolean=true`; `selfRegistrationEnabled boolean=false`; `version integer=1`; `createdAt timestamp=now`; `updatedAt timestamp`; `deletedAt timestamp?`.
- Relationships: parent of memberships, roles, permissions, provider verifications, and providers.
- Constraints: unique slug and optional email; normalized lowercase-hyphen slug check in the S0.3 migration.
- Indexes: unique `slug`; unique `email`; `slug` index.
- Sensitive/audit notes: email may be personal or organizational contact data. Public onboarding is denied by default. Soft deletion exists; retention policy is not accepted.

### `User`

- Columns: `id UUID PK`; `email citext global unique`; `passwordHash text`; `firstName text`; `lastName text`; `phone text?`; `preferredLanguage text='en'`; `status UserStatus=ACTIVE`; `version integer=1`; `createdAt timestamp=now`; `updatedAt timestamp`; `deletedAt timestamp?`.
- Relationships: global identity parent of memberships, role assignments, and one privacy record.
- Constraints: case-insensitive global unique email.
- Indexes: unique `email`.
- Migration behavior: normalized duplicate emails stop the migration without exposing email values; no automatic identity merge occurs.
- Sensitive/audit notes: identity and authentication data. Passwords use explicitly configured Argon2id. Soft-delete/retention behavior remains unaccepted.

### `TenantMembership`

- Columns: `id UUID PK`; `tenantId UUID`; `userId UUID`; `status MembershipStatus=PENDING`; `isDefault boolean=false`; `joinedAt timestamp?`; `endedAt timestamp?`; `version integer=1`; `createdAt timestamp=now`; `updatedAt timestamp`; `deletedAt timestamp?`.
- Relationships: joins global `User` to `Tenant`; parent of sessions.
- Constraints: `tenantId → Tenant.id` delete restrict; `userId → User.id` cascade delete; unique `(tenantId, userId)`; partial unique default membership per non-deleted user.
- Indexes: `(userId, status)`; `(tenantId, status)`; unique tenant/user; partial unique default.
- Migration behavior: one deterministic default membership is backfilled from every S0.2 tenant-bound user. Status maps conservatively; ambiguous global emails abort instead of merging.
- Security note: this is the sole authoritative tenant context for authentication. Role assignment remains S0.4 work.

### `UserPrivacy`

- Columns: `id UUID PK`; `userId UUID unique`; `sharePhone boolean=false`; `shareEmail boolean=false`; `allowInAppChat boolean=true`; `privatePickup boolean=false`; `hideSensitiveNotifications boolean=true`; `preferredLanguage text='en'` (legacy, non-authoritative, not exposed by accepted APIs; removal requires a reviewed data migration); `version integer=1`; `createdAt timestamp=now`; `updatedAt timestamp`.
- Relationships: belongs one-to-one to `User`.
- Constraints: foreign key `userId → User.id` with cascade delete; unique `userId`.
- Indexes: unique `userId`; `userId` index.
- Acceptance note: these preferences are not a substitute for purpose-specific medical consent. Consent Management remains blocked.

### `Role`

- Columns: `id UUID PK`; `tenantId UUID`; `name text`; `description text?`; `type RoleType=TENANT`; `version integer=1`; `createdAt timestamp=now`; `updatedAt timestamp`; `deletedAt timestamp?`.
- Relationships: belongs to `Tenant`; parent of user-role and role-permission assignments.
- Constraints: foreign key `tenantId → Tenant.id` with delete restrict; unique `(tenantId, name)`.
- Indexes: `tenantId`; composite unique `(tenantId, name)`.
- Acceptance note: cross-tenant assignment prevention is not fully enforced and remains S0.4 work.

### `Permission`

- Columns: `id UUID PK`; `tenantId UUID`; `name text`; `description text?`; `version integer=1`; `createdAt timestamp=now`; `updatedAt timestamp`; `deletedAt timestamp?`.
- Relationships: belongs to `Tenant`; parent of role-permission assignments.
- Constraints: foreign key `tenantId → Tenant.id` with delete restrict; unique `(tenantId, name)`.
- Indexes: `tenantId`; composite unique `(tenantId, name)`.
- Acceptance note: permission vocabulary and policy mapping remain S0.4 work.

### `UserRole`

- Columns: `id UUID PK`; `userId UUID`; `roleId UUID`; `createdAt timestamp=now`.
- Relationships: joins `User` to `Role`.
- Constraints: `userId → User.id` cascade delete; `roleId → Role.id` delete restrict; unique `(userId, roleId)`.
- Indexes: `userId`; `roleId`; composite unique `(userId, roleId)`.
- Gap: the database does not prove that the user and role belong to the same tenant. S0.4 must enforce and negatively test this invariant.

### `RolePermission`

- Columns: `id UUID PK`; `roleId UUID`; `permissionId UUID`; `createdAt timestamp=now`.
- Relationships: joins `Role` to `Permission`.
- Constraints: `roleId → Role.id` cascade delete; `permissionId → Permission.id` delete restrict; unique `(roleId, permissionId)`.
- Indexes: `roleId`; `permissionId`; composite unique `(roleId, permissionId)`.
- Gap: the database does not prove that the role and permission belong to the same tenant. S0.4 owns this invariant.

### `UserSession`

- Columns: `id UUID PK`; `membershipId UUID`; `familyId UUID`; `refreshTokenHash varchar(64) unique`; `ipAddress inet?`; `userAgent varchar(512)?`; `deviceName varchar(120)?`; `expiresAt timestamp`; `absoluteExpiresAt timestamp`; `lastUsedAt timestamp=now`; `status SessionStatus=ACTIVE`; `replacedById UUID? unique`; `revokedAt timestamp?`; `revocationReason varchar(120)?`; `createdAt timestamp=now`; `updatedAt timestamp`.
- Relationships: belongs to `TenantMembership`; optional self-reference to the rotation successor.
- Constraints: `membershipId → TenantMembership.id` cascade delete; `replacedById → UserSession.id` set null; unique digest and successor reference.
- Indexes: `(membershipId, status)`; `(familyId, status)`; `(status, expiresAt)`; `(status, absoluteExpiresAt)`; unique digest and successor.
- Migration behavior: all raw prototype refresh sessions are deliberately deleted and users must authenticate again. Raw credentials cannot be safely transformed into opaque single-use values.
- Sensitive/audit notes: only a peppered HMAC digest is stored. Device and network metadata remain sensitive and require an accepted retention policy.

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

### `AuditLog`

- Columns: `id UUID PK`; `organizationId UUID`; `userId UUID`; `module text`; `action text`; `resourceType text`; `resourceId text`; `oldValue jsonb?`; `newValue jsonb?`; `ipAddress text?`; `userAgent text?`; `requestId text?`; `deviceType text?`; `createdAt timestamp=now`.
- Relationships: no database foreign keys are declared.
- Indexes: `userId`; `organizationId`; `module`; `resourceType`; `createdAt`; `(organizationId, createdAt)`.
- Sensitive/audit notes: old/new JSON may contain sensitive data and requires minimization and redaction. Immutability, tenant scope, actor integrity, retention, and event integration remain rejected until S0.4.

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

- Cross-tenant RBAC relationships are not enforced by composite foreign keys; S0.4 must migrate role assignment from global-user ambiguity to membership-safe ownership.
- Several identifier columns have no foreign keys.
- Inventory and batch quantities lack database check constraints.
- `Inventory` and `Batch` are competing stock sources of truth.
- `StockMovement` and `InventoryHistory` are competing ledger/history sources.
- Audit records are not immutable or integrated with business mutations.
- Consent, purpose, retention, legal hold, archival, and deletion rules are not modeled.
- Country and data-residency partitioning are not designed.
- Seed data is intentionally absent; permission and taxonomy seeds require reviewed, idempotent specifications.

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
