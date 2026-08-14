# ADR-014: Atomic Inventory Domain Event Producers

**Status:** Proposed

**Date:** 2026-08-14

**Decision owners:** MedSphere Project Owner and CTO

**Depends on:** ADR-004, ADR-005, ADR-007, ADR-008, ADR-009 through ADR-013

## Context

ADR-013 provides a durable outbox but deliberately does not make accepted
inventory mutations produce events. Notifications and analytics therefore
remain blocked: polling audit evidence would mix compliance records with
delivery coordination, while publishing after commit could lose an event.

## Decision

- Accepted inventory mutations append one version-1 domain event for each
  completed aggregate transition in the same serializable transaction as state,
  immutable receipts or movements, and audit evidence.
- A shared `InventoryEventWriter` owns the allowlisted event catalogue and maps
  trusted tenant-user or tenant-system attribution into the ADR-013 envelope.
- Payloads contain only minimum operational identifiers, state, versions, and
  bounded counts. Subject identities, contact details, free text, request
  metadata, clinical data, and credentials are excluded.
- Idempotent replay returns the stored result without appending another event.
- Event append failure rolls back the entire mutation. No producer performs
  network delivery.

## Event catalogue

| Event                             | Aggregate             | Producer                    |
| --------------------------------- | --------------------- | --------------------------- |
| `inventory.reservation.created`   | `MedicineReservation` | Staff reservation creation  |
| `inventory.reservation.confirmed` | `MedicineReservation` | Reservation lifecycle       |
| `inventory.reservation.ready`     | `MedicineReservation` | Reservation lifecycle       |
| `inventory.reservation.completed` | `MedicineReservation` | Reservation lifecycle       |
| `inventory.reservation.cancelled` | `MedicineReservation` | Lifecycle or quarantine     |
| `inventory.reservation.expired`   | `MedicineReservation` | Reservation or batch expiry |
| `inventory.batch.expired`         | `Batch`               | Batch expiry worker         |
| `inventory.batch.quarantined`     | `Batch`               | Manual quarantine           |
| `inventory.stock.damaged`         | `Batch`               | Damaged-stock write-off     |
| `inventory.stock.transferred`     | `InventoryTransfer`   | Completed transfer          |

## Reason

Atomic producers turn the accepted outbox into usable infrastructure without
coupling inventory transactions to a notification vendor, broker, or analytics
store. A small allowlist prevents arbitrary event types and payload growth.

## Alternatives

- **Use audit rows as events:** rejected because audit retention and evidence
  semantics differ from delivery state.
- **Publish after commit:** rejected because a process failure can lose the
  event after authoritative state has committed.
- **Include subject or contact data:** rejected because delivery consumers must
  resolve recipients under a later accepted consent and privacy contract.
- **Add a provider now:** rejected because transport, preference, template, and
  recipient-resolution contracts are separate work.

## Consequences

- One command may append multiple events when it transitions multiple
  aggregates, such as quarantine cancelling reservations before quarantining a
  batch.
- Consumers can rely on stable type/version/aggregate contracts but must remain
  idempotent under at-least-once delivery.
- Event payload evolution requires a new event version and compatibility review.

## Implementation constraints

1. Append only through the ADR-013 primitive inside the authoritative
   transaction.
2. Use database-authoritative timestamps where the existing command already
   obtains one.
3. Tenant-user actor IDs come only from trusted authentication context.
4. System producers use fixed service names, never request input.
5. Do not include subject IDs, emails, phone numbers, names, addresses, free-text
   reasons, request headers, medical data, or clinical data in payloads.
6. Replays and rejected commands append no event.

## Review triggers

Review when adding a new producer domain, event version, recipient identity,
notification consumer, analytics projection, external broker, public webhook,
or payload schema registry.
