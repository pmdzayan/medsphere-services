# ADR-012: One-Way Manual Batch Quarantine

**Status:** Accepted

**Date:** 2026-08-10

**Decision owners:** MedSphere Project Owner and CTO

**Depends on:** ADR-001, ADR-002, ADR-004, ADR-005, ADR-006, ADR-007,
ADR-008, ADR-011, G3.2, G3.3, G3.7, and G3.10

## Context

The accepted inventory model prevents expired, exhausted, and deleted batches
from being allocated. It still has no safe way for assigned pharmacy staff to
make an otherwise active batch unavailable when its quality is suspect before
expiry.

Using the damage command is false accounting: quarantine does not prove that
medicine was destroyed or removed. Setting on-hand quantity to zero would also
corrupt the physical ledger. Leaving reservations active would be unsafe when
they hold units from the quarantined batch.

A full quality lifecycle would require investigation, evidence attachments,
approval, release, recall, disposal, supplier return, controlled-medicine, and
regulatory policy that Version 1 has not accepted. Bundling that lifecycle now
would produce a large, ambiguous security boundary.

## Decision

### Boundary and meaning

Version 1 accepts one provider-scoped, authenticated command that moves an
undeleted `ACTIVE` batch to `QUARANTINED`. The transition is intentionally
one-way. It makes the batch unavailable, releases every reservation that can no
longer be fulfilled safely, preserves physical quantities, and records
immutable evidence.

This decision does not authorize release from quarantine, disposal, recall,
return, transfer, adjustment, investigation workflow, or notification.

### Trusted command authority

- Mount one command in the accepted Inventory controller:
  `POST /inventory/providers/:providerId/batches/:batchId/quarantine`.
- Require authenticated tenant identity, active trusted provider assignment,
  and a migration-owned `inventory.batch.quarantine` permission granted by
  migration only to active built-in `TENANT_ADMINISTRATOR` system roles.
- Conceal missing, cross-tenant, deleted, inactive-provider, and unassigned
  resources behind the existing not-found boundary.
- Accept only canonical provider/batch UUID path values plus a strict body with
  `expectedVersion`, `idempotencyKey`, and one allowlisted reason code.
- Allow reason codes `QUALITY_SUSPECT`, `TEMPERATURE_EXCURSION`,
  `PACKAGING_COMPROMISED`, and `STORAGE_DEVIATION`. Accept no free text,
  evidence URL, patient data, product identity, tenant identity, actor identity,
  quantities, resulting state, or timestamps from the client.

### Atomic transition

Process the command in one PostgreSQL serializable transaction with bounded
retry:

1. Prove active membership/provider assignment and load the exact batch by
   tenant, provider, and ID.
2. Authorize replay only after trusted provider access and compare an exact
   canonical command hash.
3. Require the batch to be undeleted, `ACTIVE`, not past its expiry date, and at
   the exact expected version. G3.10 owns due expiry reconciliation.
4. Load affected active reservations with `HELD` allocations on the batch in
   stable ID order. Apply hard limits to reservations and allocations before
   mutation.
5. Validate each affected reservation's complete items and allocations. Release
   **all** held allocations for that reservation through the accepted shared
   release primitive, including allocations on other batches.
6. Transition each affected reservation to `CANCELLED`, increment its version,
   append one deterministic `CANCEL` command, and append one tenant-system
   `inventory.reservation.cancelled` audit with cause `BATCH_QUARANTINE`.
7. Prove the candidate batch now has zero held quantity.
8. Preserve `receivedQuantity` and `onHandQuantity`; set only status to
   `QUARANTINED` and increment version once.
9. Insert one immutable quarantine record and one tenant-user
   `inventory.batch.quarantined` audit in the same transaction.

Any assignment, allocation, quantity, version, command, record, audit, or
database invariant failure rolls back the complete command.

### Evidence and ledger

`BatchQuarantineRecord` stores one record per batch: identifier; tenant,
inventory, provider, product, and batch scope; allowlisted reason; actor
membership; on-hand quantity; affected-reservation and released-unit counts;
canonical command hash and idempotency key; resulting batch version; occurred
and creation timestamps. Composite foreign keys prove tenant scope.

The record is append-only through a database trigger. Database checks enforce
bounded strings, non-negative counts, positive versions, timestamp equality,
and exact reason values. The audit allowlist adds
`inventory.batch.quarantined`; reservation cancellation metadata permits only
the exact `BATCH_QUARANTINE` cause extension.

No `StockMovement` is created because quarantine does not change on-hand
quantity. A later accepted disposal or return command must decrement the batch
and append the correct movement.

### Idempotency and concurrency

- The client supplies a bounded idempotency key unique within the tenant.
- The canonical hash includes tenant, provider, batch, expected version, and
  reason code; it excludes actor and request metadata.
- Exact replay returns the immutable receipt only after current trusted provider
  access. A mismatched replay conflicts without exposing the prior command.
- Concurrent quarantine commands have one winner. Races with receipt,
  adjustment, damage, transfer, reservation completion/cancellation, and G3.10
  have one valid terminal result.
- Repeated execution cannot release reservations, change batch state, or append
  commands, records, movements, or audits twice.

### Read and privacy behavior

The existing assigned-provider stock read may return `QUARANTINED` batches with
zero available quantity while preserving on-hand and held quantities. Its DTO,
strict web parser, tests, and UI status presentation must be updated together.
No new list endpoint or patient/public exposure is added.

Command responses and logs contain bounded operational identifiers, reason
code, counts, versions, and timestamps only. They contain no subject-user ID,
patient identity, prescription data, notes, contact details, credentials,
tokens, request bodies, prices, or free text.

## Consequences

Assigned staff gain a truthful medicine-safety stop that immediately removes
suspect stock from availability and cancels unsafe holds without claiming
physical removal. The audit and immutable receipt preserve who initiated the
action and why.

The tradeoff is a new terminal batch status, permission, command/record
invariants, reservation side effects, and UI status handling. Quarantined units
remain physically on hand indefinitely until a separately accepted release,
return, recall, or disposal policy exists.

## Alternatives rejected

1. **Use damaged-stock write-off** — falsely decrements physical quantity.
2. **Set availability to zero without durable state** — loses authority,
   idempotency, and auditability.
3. **Block quarantine when a hold exists** — leaves unsafe reservations active.
4. **Release only allocations on the selected batch** — invents partial
   fulfilment and breaks reservation totals.
5. **Reuse `EXPIRED`** — confuses time-based expiry with a quality hold.
6. **Add release, recall, disposal, and evidence now** — combines distinct
   authority and regulatory lifecycles without accepted policy.

## Implementation constraints

1. Extend the accepted Inventory owner; do not add a service or gateway route.
2. Reuse trusted provider access, serializable retry, allocation release,
   strict DTO, replay, audit, and no-store response patterns.
3. Add only forward migrations with clean and populated G3.10 upgrade evidence.
4. Add real PostgreSQL rollback, idempotency, concurrency, permission, and
   cross-tenant tests.
5. Add no scheduler, event bus, notification, attachment, free-text reason,
   patient endpoint, release command, or stock movement.

## Review triggers

Review this decision when quarantine release, quality investigation, evidence
storage, recall, supplier return, disposal, controlled medicines, notification
delivery, or regulatory reporting is designed.
