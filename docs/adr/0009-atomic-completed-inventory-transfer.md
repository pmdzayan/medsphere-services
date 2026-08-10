# ADR-009: Atomic Completed Inventory Transfer

**Status:** Accepted in PR #28; implemented and accepted in PR #29

**Date:** 2026-08-09

**Decision owners:** MedSphere Project Owner and CTO

**Depends on:** ADR-001, ADR-002, ADR-003, ADR-004, ADR-005, ADR-006,
ADR-007, and ADR-008

## Context

ADR-005 reserves `TRANSFER_OUT` and `TRANSFER_IN` ledger reasons but does not
define a safe transfer command. Recording only one side would lose stock or
create stock. Treating a database transaction as a shipment workflow would
also falsely claim that MedSphere tracks custody while medicine is in transit.

The accepted provider-assignment boundary proves which provider locations a
membership may operate. It does not permit a user assigned to one provider to
mutate another provider, even inside the same tenant. The current schema has no
transfer aggregate, in-transit location, dispatch/receipt states, approval
policy, or discrepancy workflow.

G3.8 needs a narrow operation that improves inventory correctness without
inventing logistics capabilities that do not exist.

## Decision

### Meaning of the command

Version 1 accepts one **completed-transfer recording** command. It records a
physical handoff that has already completed between two provider locations in
the same tenant. The command atomically relocates one positive quantity from
one exact source batch to the corresponding destination batch.

It is not a dispatch, shipment, delivery, tracking, approval, or in-transit
workflow. The API and documentation must use wording such as “record completed
transfer” and must not imply live custody tracking.

### Authority and scope

- Tenant and actor authority come only from the verified authenticated
  membership.
- Source and destination providers must be different, active, undeleted, and
  belong to the actor's tenant.
- The actor must hold the migration-owned transfer permission and have live
  `MembershipProviderAccess` to both providers.
- Both provider checks occur before idempotency receipt lookup. Missing,
  unassigned, cross-tenant, or inactive providers share the accepted not-found
  boundary.
- Client-supplied tenant, membership, user, role, permission, actor, inventory,
  destination batch, or movement identity is never authoritative.

### Transfer record

Inventory owns an immutable tenant-scoped `InventoryTransfer` record containing:

- identifier, tenant, source provider, destination provider, and product;
- source and destination inventory and batch identifiers;
- positive transferred quantity;
- caller idempotency key and canonical SHA-256 command hash;
- source and destination movement identifiers; and
- one database-generated completion timestamp.

Composite foreign keys prove that every inventory, batch, product, provider,
and movement reference belongs to the same tenant and expected provider.
The record is append-only through a PostgreSQL trigger. It has no status because
this boundary represents only an already completed transfer.

### Atomic stock behavior

The command runs in one PostgreSQL serializable transaction with bounded retry:

1. Verify both live provider assignments and the dedicated permission.
2. Resolve an authorized matching idempotency receipt or reject hash mismatch.
3. Capture one authoritative database timestamp.
4. Lock or conditionally update the exact active, undeleted, unexpired source
   batch at the expected version.
5. Require the requested quantity not to exceed
   `onHandQuantity - heldQuantity`. Held units never move.
6. Decrement source `onHandQuantity`, preserve `heldQuantity` and
   `receivedQuantity`, increment its version, and set `EXHAUSTED` only when
   both on-hand and held quantities become zero.
7. Require an undeleted destination inventory listing for the same product.
8. Resolve a destination batch by tenant, destination provider, product, and
   batch number. If present, its manufacturing date, expiry date, purchase
   price, and selling price must exactly match the source provenance. Its status
   must be `ACTIVE` or `EXHAUSTED`; an `EXPIRED` row fails closed. Increment both
   destination `receivedQuantity` and `onHandQuantity`, preserve held quantity,
   set it active, and increment its version.
9. If no destination batch exists, create it from the exact source provenance
   with received and on-hand quantities equal to the transfer quantity and held
   quantity zero.
10. Append one source `TRANSFER_OUT` movement and one destination `TRANSFER_IN`
    movement. Their deltas, before/after equations, transfer reference, actor,
    command hash, and timestamp must reconcile exactly.
11. Insert the immutable transfer record and one
    `inventory.stock.transferred` tenant-user audit event in the same
    transaction.

Any provider, listing, batch, provenance, version, availability, movement,
receipt, or audit conflict rolls back both sides. Arithmetic is never clamped.

### Idempotency and concurrency

- The external idempotency key is tenant-unique and bounded so derived movement
  keys remain within the database limit.
- The canonical hash includes the tenant-derived scope, both providers, source
  batch, expected source version, quantity, and normalized reason.
- Exact replay returns the stored receipt without repeating either quantity
  update, movement, transfer record, or audit event.
- Same-key/different-command reuse conflicts.
- Concurrent transfers from one source version permit one valid winner.
- Concurrent receipt into the same destination batch uses exact expected state
  and serializable retry; it cannot lose increments or create duplicate batches.

### Audit and privacy

- Add the reviewed permission `inventory.stock.transfer` through a forward
  migration and assign it to the built-in tenant administrator role.
- Add the reviewed event `inventory.stock.transferred` with allowlisted metadata
  limited to source provider ID, destination provider ID, product ID, and
  quantity.
- Audit uses the authenticated tenant membership actor and is atomic with stock.
- Logs contain only bounded categories and counts. No patient, prescription,
  clinical, credential, token, price, or free-text reason data is logged.

## Alternatives considered

### Immediate one-sided stock adjustment

Rejected. It cannot prove conservation across locations and can create or lose
medicine stock.

### Full dispatch, transit, receipt, discrepancy, and cancellation workflow

Deferred. That design needs custody states, authorization separation, loss and
damage policy, notifications, operational recovery, and possibly additional
locations. Claiming it now would be fake logistics.

### Require access to only the source provider

Rejected. It would let a source operator mutate and enumerate an unauthorized
destination provider.

### Automatically create a destination inventory listing

Rejected. A transfer cannot silently invent destination commercial, tax,
visibility, or stock-policy configuration.

### Move held quantities

Rejected. Held units belong to exact reservations at the source provider.

### Reuse generic adjustment movements

Rejected. Separate transfer movement types and an immutable shared transfer
reference are required to prove conservation and prevent misleading audit.

## Consequences

### Positive

- Completed physical transfers can be recorded without stock creation or loss.
- Both provider boundaries remain deny-by-default.
- Batch provenance, held stock, ledger equations, audit, and idempotency remain
  enforceable.
- The model does not pretend to provide unimplemented shipment tracking.

### Negative and trade-offs

- Operators need assignment to both locations, which is deliberately stricter
  than a future source/destination role split.
- Only one batch can be transferred per command.
- The command cannot represent stock currently in transit, partial receipt,
  discrepancy, rejection, or reversal.
- Destination listing configuration must already exist.

## Implementation constraints

- Inventory remains owned and mounted in `auth-service`; do not add behavior to
  the rejected inventory prototype or another deployable.
- Use forward-only Prisma migration history with clean and populated upgrade
  verification.
- Reuse accepted identity, provider access, permission guard, audit writer,
  serializable retry, request metadata, error envelope, DTO, and command
  patterns.
- Do not add dependencies, event delivery, background workers, frontend
  controls, patient data, supplier behavior, payment, delivery, controlled
  medicine, or analytics.
- Real PostgreSQL tests must prove conservation, isolation, idempotency,
  concurrency, append-only evidence, and complete rollback.

## Review triggers

Review this decision before adding dispatch/receipt states, in-transit custody,
partial or multi-batch transfers, discrepancy or reversal workflows, approval
chains, provider groups, warehouses within one provider, cross-tenant networks,
controlled medicines, or asynchronous transfer events.
