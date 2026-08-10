# ADR-011: Physical Batch Expiry Reconciliation

**Status:** Proposed

**Date:** 2026-08-10

**Decision owners:** MedSphere Project Owner and CTO

**Depends on:** ADR-001, ADR-002, ADR-004, ADR-005, ADR-006, ADR-008,
G3.7, G3.8, and G3.9

## Context

ADR-005 makes `Batch` the physical and held quantity authority and excludes a
batch from availability when its date has passed. The accepted reads also
derive zero availability from the authoritative current time. That prevents
new allocation, but it does not durably change an `ACTIVE` batch to `EXPIRED`.

G3.7 expires reservations when their own `expiresAt` passes. A reservation can
still have a later reservation expiry while one of its held batches reaches its
medicine expiry date. Leaving that reservation active would preserve an invalid
hold and misrepresent fulfilment safety.

Expiry is not disposal. Medicine can remain physically present after it becomes
unusable. Decreasing `onHandQuantity` or appending an `EXPIRED` stock movement
at the date boundary would falsely claim physical removal. Quarantine,
destruction, supplier return, recall, approval, and evidence capture also have
no accepted lifecycle.

## Decision

### Meaning and ownership

Version 1 accepts one bounded, non-HTTP worker that reconciles due physical
batches inside the Inventory bounded context. It marks a due batch unusable,
releases reservations that can no longer be fulfilled safely, and records
immutable expiry evidence.

The worker does not remove, destroy, quarantine, return, recall, or transfer
medicine. It does not claim notification delivery or a production schedule.

### Selection and time authority

- Capture one database timestamp, `asOf`, for each run.
- Select only undeleted `ACTIVE` batches with `expiryDate <= asOf`.
- Use bounded positive safe-integer batch and maximum-record limits.
- Apply documented hard limits to affected reservations and allocations per
  candidate. Exceeding a limit fails that candidate closed instead of loading
  or locking an unbounded aggregate.
- Use stable order `expiryDate`, `tenantId`, `id` and a supporting index.
- Selection may cross tenants, but every candidate is processed only in its
  database-derived tenant scope. No caller supplies tenant or actor identity.
- Never load an unbounded set or retry one failed candidate indefinitely.

### Atomic reconciliation

Process each candidate batch in one PostgreSQL serializable transaction with
bounded retry:

1. Re-read its exact tenant, inventory, provider, product, status, quantities,
   version, deletion state, and due date.
2. Treat a batch that is missing, deleted, no longer active, or no longer due
   as a safe concurrent skip.
3. Find every distinct active medicine reservation with a `HELD` allocation on
   the batch in stable reservation-ID order.
4. For each affected reservation, validate its complete item and allocation
   integrity and release **all** of its held allocations, including allocations
   on other batches. Partial reservation fulfilment is not invented.
5. Transition that reservation to `EXPIRED`, using the accepted reservation
   command and tenant-system audit boundary with a bounded batch-expiry cause.
6. Re-read or conditionally prove that the candidate batch has zero held units.
7. Change only the candidate status to `EXPIRED` and increment its version.
   Preserve received and on-hand quantities exactly.
8. Insert one immutable `BatchExpiryRecord` and one
   `inventory.batch.expired` tenant-system audit event using the same `asOf`.

Any allocation mismatch, quantity underflow, stale write, command conflict,
expiry-record conflict, audit failure, or database invariant failure rolls back
the entire candidate, including every affected reservation release.

### Durable evidence and stock ledger

`BatchExpiryRecord` contains an identifier; tenant, inventory, provider,
product, and batch scope; the immutable batch expiry date; on-hand quantity at
reconciliation; resulting batch version; database reconciliation timestamp;
and creation timestamp. The batch is unique in this record and composite
foreign keys prove its scope.

The record is append-only through a database trigger. Positive version and
non-negative quantity checks fail closed. The application and database audit
allowlists add `inventory.batch.expired` with only product ID, on-hand units,
released reservation count, released units, and resulting version.

No `StockMovement` is created because on-hand quantity does not change. A later
accepted physical-disposal or return command must decrement on-hand and append
the correct movement. The existing `EXPIRED` movement enum does not authorize
that missing workflow.

### Concurrency and idempotency

- Multiple workers may overlap safely; one batch can gain at most one expiry
  record and one status transition.
- Re-running skips an already reconciled batch without changing quantities,
  releases, commands, records, or audit events again.
- A reservation race with G3.7 or a staff terminal transition has one valid
  winner. Completed or cancelled reservations are never overwritten.
- A reservation spanning multiple due batches is expired once. Later candidate
  processing observes released allocations.
- Conditional writes include exact tenant scope, identity, status, quantities,
  and version. Serialization conflicts use the accepted bounded retry helper.

### Execution and privacy

Use one standalone application-context process with no HTTP listener. An
external scheduler may invoke it later, but this decision does not claim that
deployment. A bounded run returns counts for selected, reconciled, skipped, and
failed batches plus allowlisted failure categories. Any failed selected batch
causes a non-zero process exit after the bounded run finishes.

Logs, summaries, audit metadata, and expiry records contain no subject-user
identity, patient data, prescription data, notes, contact details, credentials,
tokens, request bodies, prices, or free text. Tenant-system audit has no user
actor fields.

## Consequences

Expired medicine becomes durably unusable and invalid reservation holds are
released without corrupting the physical-stock ledger. The system gains a
truthful distinction between expiry and physical removal.

The tradeoff is one migration, one immutable record, one audit event, a
supporting selection index, and careful reuse of reservation-release logic.
Physically expired units remain on hand until a later disposal or return
contract is accepted; that is intentional, not a completed disposal claim.

## Alternatives rejected

1. **Set on-hand to zero at expiry** — falsely records physical removal.
2. **Append a zero-delta movement** — violates the non-zero ledger contract.
3. **Skip batches with holds** — leaves unsafe reservations active indefinitely.
4. **Release only the expired allocation** — invents partial reservation
   semantics and breaks item/allocation totals.
5. **Reuse reservation `expiresAt` as batch expiry** — the two clocks represent
   different safety facts.
6. **Bundle alerts, disposal, quarantine, recall, or returns** — each needs a
   separate policy and acceptance boundary.

## Implementation constraints

1. Reuse or extract the accepted reservation allocation-release primitive; do
   not duplicate G3.7 logic or start a nested root-client transaction.
2. Preserve one transaction client across batch, reservation, command, expiry
   record, and audit writes.
3. Add only forward migrations with clean and populated G3.9 upgrade evidence.
4. Add real PostgreSQL rollback, idempotency, and concurrency tests.
5. Add no HTTP route, permission, frontend, gateway, dependency, event bus,
   notification, or second domain owner.

## Review triggers

Review this decision when physical disposal, quarantine, recall, supplier
returns, partial reservation fulfilment, controlled medicines, notification
delivery, or a production scheduler is designed.
