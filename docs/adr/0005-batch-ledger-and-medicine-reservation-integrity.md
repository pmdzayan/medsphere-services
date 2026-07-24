# ADR-005: Batch Ledger and Medicine Reservation Integrity

**Status:** Accepted

**Date:** 2026-07-25

**Decision owners:** MedSphere Project Owner and CTO

**Depends on:** ADR-001, ADR-002, ADR-003, ADR-004

## Context

The S0.2 schema made the prototype reproducible but did not accept its inventory
or reservation design. The current implementation has correctness failures that
cannot be repaired with isolated validation:

- `Inventory.quantity` and `Batch.currentQuantity` are independent mutable
  representations of the same physical stock.
- `Inventory` duplicates batch number, expiry, and selling price without a
  foreign key to `Batch`.
- `StockMovement` and `InventoryHistory` duplicate ledger evidence while both
  remain mutable or deletable.
- repository methods use a root Prisma client inside interactive transaction
  callbacks, so several apparently transactional workflows can commit partial
  writes;
- read-then-write quantity calculations have no lock, compare-and-swap, or
  serializable retry and can oversell under concurrency;
- batch underflow is sometimes hidden with `Math.max(0, ...)`;
- FEFO selection occurs before protected writes and is stale by the time stock
  is deducted;
- reservation product, quantity, and expiry are embedded in an unvalidated JSON
  `notes` field without foreign keys;
- medicine reservation logic exists in both inventory-service and
  reservation-service, with different state transitions and no single owner;
- reservation-service controllers use a fixed all-zero user identifier;
- the first inventory row returned by the database is treated as authoritative,
  even when a provider has multiple batches;
- stock and reservation rows do not carry tenant scope or database-enforced
  same-tenant relationships; and
- no real PostgreSQL concurrency or rollback suite covers inventory and
  reservation mutations.

S0.5 must establish one owner, one quantity model, one ledger, and one atomic
reservation hold lifecycle before supplier, pharmacy, marketplace, delivery, or
payment work begins.

## Decision

### Domain ownership and deployment boundary

- The Inventory bounded context owns provider-product inventory configuration,
  batches, stock movements, availability, FEFO allocation, medicine
  reservations, reservation items, and batch allocations.
- Medicine reservation behavior is removed from reservation-service after
  characterization and migration safety are proven. Hospital appointments,
  laboratory bookings, and vaccinations are not inventory reservations and
  will receive domain-specific models in later milestones.
- S0.5 does not approve the current inventory-service as an independent
  microservice. It remains a temporary composition root while the bounded
  module is made reusable by the Version 1 modular monolith.
- No inventory or reservation route is production-approved merely because it
  exists. Only explicitly accepted, authenticated, tenant-bound routes may be
  mounted.

### Canonical stock model

`Inventory` becomes one tenant-scoped provider-product listing. It owns
commercial and operational configuration such as SKU, MRP, tax, discount,
minimum stock level, and visibility. It does not store batch number, expiry,
on-hand quantity, held quantity, or a derived `inStock` flag.

`Batch` becomes the sole mutable physical-stock state:

- every batch belongs to exactly one `Inventory` listing;
- every batch carries the same tenant, provider, and product scope as its
  inventory listing, enforced with a composite foreign key;
- `onHandQuantity` is non-negative;
- `heldQuantity` is non-negative and never exceeds `onHandQuantity`;
- `availableQuantity` is derived as `onHandQuantity - heldQuantity`;
- received quantity is positive and cannot be lower than current on-hand
  quantity;
- batch number is unique within tenant, provider, and product;
- manufacturing date, when present, is earlier than expiry;
- expired or soft-deleted batches are never available; and
- status cannot be used to make an expired or exhausted batch sellable.

Availability is calculated from eligible batches. A later measured projection
or cache may accelerate reads, but it cannot become a second authority.

### Append-only stock ledger

`StockMovement` is the single authoritative history of on-hand quantity
changes. Each entry:

- is tenant-scoped and linked to one inventory listing and one batch;
- records a non-zero signed delta plus before and after on-hand quantities;
- records a typed movement reason, actor membership or approved system actor,
  reference, idempotency key, and occurrence time;
- has database checks proving `after = before + delta`;
- is immutable after insertion through a PostgreSQL trigger; and
- cannot be soft-deleted, edited, or replaced by a generic history snapshot.

`InventoryHistory` is retired only after the forward migration proves that
legacy rows are represented by corresponding stock movements. Ambiguous or
unmatched legacy evidence blocks migration for explicit remediation.

### Medicine reservation aggregate

The generic prototype `Reservation` is replaced by an explicit medicine
reservation aggregate:

- `MedicineReservation` is the tenant/provider header and records the
  authenticated subject user, lifecycle status, explicit expiry, state
  timestamps, version, idempotency key, and bounded non-clinical notes.
- `MedicineReservationItem` records each requested product and quantity.
- `MedicineReservationAllocation` records the exact batch quantities held for
  each item.
- One reservation may contain multiple items for one provider. This supports a
  future pharmacy cart without introducing delivery, payment, or split-order
  behavior in S0.5.
- Allocations are created in deterministic FEFO order when the reservation is
  created. Stock is therefore held against concrete batches, not against an
  unscoped product total.
- Allocation rows distinguish held, consumed, and released outcomes and enforce
  that consumption and release are mutually exclusive.

Hospital, laboratory, vaccination, delivery, payment, prescription, and
controlled-medicine workflows remain out of scope.

### Reservation state machine

Accepted transitions are:

| From        | To                                  |
| ----------- | ----------------------------------- |
| `PENDING`   | `CONFIRMED`, `CANCELLED`, `EXPIRED` |
| `CONFIRMED` | `READY`, `CANCELLED`, `EXPIRED`     |
| `READY`     | `COMPLETED`, `CANCELLED`, `EXPIRED` |
| `COMPLETED` | none                                |
| `CANCELLED` | none                                |
| `EXPIRED`   | none                                |

Every transition uses an expected version. Concurrent attempts permit one
winner. Terminal transitions are irreversible.

- Create increases batch held quantities and creates allocation and audit rows.
- Complete decreases both on-hand and held quantities, consumes allocations,
  creates stock movements, updates the reservation, and writes audit evidence
  in one transaction.
- Cancel and expire decrease held quantities, release allocations, update the
  reservation, and write audit evidence in one transaction.
- Failures roll back the whole transition. Partial release, partial
  consumption, silent exception swallowing, and clamped arithmetic are
  prohibited.

### Transaction and concurrency contract

- Every protected workflow receives and uses the same
  `Prisma.TransactionClient`; repositories cannot silently fall back to the root
  client.
- Quantity checks and writes execute inside a PostgreSQL serializable
  transaction with bounded retry for serialization conflicts.
- Batches are processed in stable FEFO order using `expiryDate`,
  `manufacturingDate`, `createdAt`, and `id` as ordered tie-breakers. This
  reduces deadlocks and makes allocation deterministic.
- Conditional updates and database checks prevent negative or over-held stock,
  even if application validation is bypassed.
- Every command that may be retried carries a tenant-scoped idempotency key.
- Nested root-client transactions and time-derived reference identifiers are
  prohibited.

### Tenant, authorization, and audit boundary

- Tenant authority comes only from the accepted authenticated identity.
  Provider, tenant, actor, and user identifiers supplied by a request do not
  override that identity.
- Inventory, batch, movement, reservation, item, and allocation rows carry
  tenant scope. Composite keys prove provider, inventory, batch, reservation,
  item, and actor membership belong to the same tenant.
- S0.5 extends the migration-owned permission catalogue only for routes that
  are actually accepted. Wildcards and runtime-created permissions remain
  prohibited.
- Stock and reservation mutations create typed `AuditEvent` rows in the same
  transaction. Metadata is bounded and excludes patient contact information,
  prescriptions, clinical notes, credentials, and request bodies.
- Automatic expiry requires a tenant-scoped system audit event. ADR-005 extends
  ADR-004 to allow a `SYSTEM` actor in tenant scope only when `tenantId` is
  present and all user actor fields are absent.
- Patient self-service authorization and tenant-scoped global-user audit
  attribution are deferred to the Marketplace policy decision. S0.5 does not
  invent a permissive fallback.

### API and workflow exposure

- Existing prototype controllers are not accepted as public contracts.
- Client-controlled `providerId`, `tenantId`, or actor identifiers are not
  authoritative.
- Structured fields are never encoded in `notes`.
- Command DTOs use UUID, enum, integer, length, date, and idempotency
  validation. Collection queries are bounded and stable.
- Swagger documentation, permission guards, tenant tests, and audit behavior
  are mandatory for every route that S0.5 ultimately mounts.
- Public patient reservation creation remains unmounted until its Marketplace
  authorization and audit actor policy is accepted.

### Migration strategy

- Use forward-only migrations from the accepted S0.4 squash commit
  `4ea55a17e188410ddee45fa3ea6c016e22d6617a`.
- Backfill tenant scope from `Provider.tenantId`; mismatches abort.
- Consolidate legacy inventory rows only when rows for the same
  provider-product have compatible configuration and can be matched
  deterministically to batches.
- Legacy on-hand quantities must reconcile with batch totals. Legacy held
  quantity or reservation data that cannot be allocated to exact batches blocks
  migration.
- Non-medicine reservation rows are not guessed into another domain.
- Migration diagnostics report identifiers or category counts only when safe;
  they do not print patient or clinical data.
- CI proves a clean database, a valid populated S0.4 upgrade, and independent
  fail-closed corruption scenarios before acceptance.

## Reason

Physical medicine stock exists in identifiable batches because expiry, recall,
purchase cost, and FEFO all depend on lot identity. Making the batch the only
quantity authority eliminates reconciliation between two mutable stock totals.
An append-only movement ledger preserves why the balance changed without
pretending duplicate snapshot tables are audit evidence.

Reserving a product total and choosing a batch only at pickup permits two users
to hold the same units. Allocating concrete batches during reservation creation
makes availability, cancellation, expiry, and pickup part of one enforceable
transactional model.

Explicit tenant keys and composite foreign keys keep a later maintenance script
or application bug from relabeling foreign stock. Serializable transactions,
conditional writes, immutable ledger entries, idempotency, and real PostgreSQL
concurrency tests are required because mocked read-then-write tests cannot prove
inventory correctness.

## Alternatives considered

### Keep `Inventory` and `Batch` as equal stock authorities

Rejected. Two writable balances inevitably drift and make availability
ambiguous.

### Treat each `Inventory` row as a batch and delete `Batch`

Rejected. It mixes provider-product configuration with lot-specific receipt,
expiry, recall, cost, and FEFO behavior and makes future procurement harder to
model.

### Derive every balance only by summing the ledger

Not selected for Version 1. It is conceptually pure but makes every availability
and concurrency decision depend on replay or projection infrastructure.
Batch state plus an immutable ledger provides strong correctness with simpler
operational behavior. The ledger remains the reconciliation authority.

### Reserve only a provider-product aggregate

Rejected. It cannot guarantee FEFO, batch expiry safety, or release the exact
held units.

### Keep one generic reservation table for medicine, hospitals, labs, and vaccines

Rejected. These workflows have different subjects, resources, state machines,
consent, scheduling, fulfilment, and policy requirements.

### Fix existing methods one by one

Rejected. Root-client repository calls, duplicated ownership, missing tenant
keys, and incompatible models are structural defects. Local patches would
preserve the false transaction boundary.

### Split inventory and reservation into independent services

Rejected for Version 1. Holding and consuming stock require one transaction.
Distributed reservation would add failure recovery, messaging, and consistency
cost before the domain is stable.

### Clamp negative quantities to zero

Rejected. Clamping hides overselling and destroys evidence. Invalid arithmetic
must fail and roll back.

## Consequences

### Positive

- One physical-stock authority and one immutable ledger.
- Deterministic FEFO with exact batch holds.
- Atomic create, complete, cancel, and expiry workflows.
- Database-enforced tenant and quantity integrity.
- Multi-item reservations support future carts without implementing delivery or
  payment early.
- Duplicate reservation logic and fake transaction boundaries are removed.
- Supplier receipt, transfer, return, damage, expiry, analytics, and recall work
  receive stable extension points.

### Negative and trade-offs

- The migration and repository rewrite are substantial and cannot be delegated
  as a small refactor.
- Availability queries require indexed batch aggregation instead of reading an
  `inStock` flag.
- Strict populated-upgrade checks may block ambiguous prototype data and require
  explicit remediation.
- Serializability and deterministic locking reduce peak write concurrency but
  protect correctness.
- Patient self-service remains unavailable until Marketplace authorization and
  audit attribution are designed.
- Existing prototype API compatibility is not guaranteed because those APIs
  were never accepted.

## Implementation constraints

- One S0.5 branch and one focused pull request.
- Architecture, migration, stock, reservation, infrastructure, and acceptance
  checkpoints are committed separately.
- Reuse the accepted S0.3 identity, S0.4 authorization, audit model, serializable
  retry behavior, validation, logging, and error contracts.
- Extract shared transaction or audit primitives into focused packages; do not
  duplicate auth-service files or create a common-utility dumping ground.
- Do not add a deployable service.
- Do not expose provider, inventory, or reservation routes before authentication,
  authorization, tenant binding, audit, and infrastructure tests pass.
- Preserve supported languages `en`, `hi`, `ta`, `te`, and `kn`.
- Do not add delivery, payment, prescription adjudication, insurance, clinical,
  controlled-medicine, consent, privacy, or retention behavior.
- Run clean and populated PostgreSQL 16 migration verification, formatting,
  lint, tests, build, security review, and architecture review before
  acceptance.

## Review triggers

Review this decision before:

- introducing multiple stock locations or warehouses inside one provider;
- supporting pack, strip, dose, or unit-of-measure conversion;
- adding recalls, quarantine, cold-chain, or controlled-medicine handling;
- allowing backorders or negative inventory;
- implementing split orders, delivery, payment capture, or cross-provider carts;
- exposing patient self-service reservations;
- replacing batch state with ledger projections or asynchronous consistency;
- extracting inventory into an independent service; or
- changing audit actor scope for external users.
