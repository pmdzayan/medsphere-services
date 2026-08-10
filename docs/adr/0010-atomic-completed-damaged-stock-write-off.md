# ADR-010: Atomic Completed Damaged-Stock Write-off

**Status:** Accepted in PR #31; implementation acceptance pending

**Date:** 2026-08-10

## Context

MedSphere has accepted batch quantity authority, append-only stock movements,
provider-scoped commands, reservation expiry, and completed transfers. It still
cannot truthfully record medicine units already confirmed damaged and removed
from usable stock.

Generic adjustment would erase the business cause. Treating damage as
quarantine, recall, supplier return, disposal, or approval would fabricate
unaccepted workflows.

## Decision

Version 1 accepts one command recording an **already confirmed damaged-stock
write-off** for one exact batch at one assigned provider. It is an atomic
inventory fact, not incident management or disposal.

### Authority

- Tenant and actor come only from authenticated membership.
- The provider must be active, undeleted, same-tenant, and live-assigned before
  any idempotency receipt lookup.
- The actor must hold migration-owned `inventory.stock.damage`.
- Client tenant, membership, user, role, permission, inventory, product,
  movement, status, or audit identity is never authoritative.

### Quantity behavior

- Source is one exact active, undeleted, unexpired batch at expected version.
- Positive database-safe quantity cannot exceed on-hand minus held.
- Held and received quantities never change.
- On-hand decreases exactly once and version increments once.
- Status becomes `EXHAUSTED` only when on-hand and held are both zero;
  otherwise it remains `ACTIVE`.
- Expired stock requires a later expiry/disposal contract. Damage cannot bypass
  reservation holds or another lifecycle.

### Ledger, replay, and audit

- One append-only `DAMAGED` movement stores negative delta, exact before/after,
  `inventory.stock.damage` reference, bounded reason, database timestamp,
  tenant-user actor, idempotency key, and SHA-256 command hash.
- `StockMovement` gains optional positive `resultingBatchVersion`. G3.9
  requires it for movements carrying the new `inventory.stock.damage`
  reference, preserving exact replay after later mutations while leaving
  accepted legacy movements valid.
- Exact replay returns the original response; same-key/different-hash is
  conflict. Revoked access conceals prior receipts.
- One atomic `inventory.stock.damaged` tenant-user audit contains only
  `productId`, `quantity`, `onHandBefore`, and `onHandAfter`. Reason is excluded
  from audit metadata and logs.

### Transaction and failure

The command runs in one PostgreSQL serializable transaction with bounded retry.
Authorization precedes replay lookup. Conditional update, movement, and audit
all commit or all roll back. Concurrent commands at one expected version have
at most one winner.

## Consequences

Damage becomes distinct from adjustment, transfer, return, and expiry while
available stock and ledger evidence stay reconciled. Held medicine cannot be
silently destroyed and replay stays exact. The tradeoff is one additive
migration, permission, audit allowlist entry, and nullable version snapshot.

This does not locate, photograph, approve, quarantine, dispose, reverse, or
return damaged goods.

## Rejected alternatives

1. Generic adjustment — loses the damage fact.
2. Full damage lifecycle — approval, quarantine, disposal, and reversal policy
   are not accepted.
3. Held-unit write-off — violates reservation integrity.
4. Client-selected inventory/product/status — breaks trusted authority.
5. Bundled returns, recall, or UI — combines unrelated boundaries.

## Scope guard

No frontend, gateway, dependency, service, quarantine, recall, expiry disposal,
supplier return, refund, notification, analytics, attachment, approval,
reversal, patient, prescription, or controlled-medicine behavior is added.
