# ADR-016: Reservation-Ready Notification Consumer

**Status:** Accepted

**Date:** 2026-08-14

**Decision owners:** MedSphere Project Owner and CTO

**Depends on:** ADR-003, ADR-004, ADR-005, ADR-008, ADR-013, ADR-014, and ADR-015

**Acceptance evidence:** PR #58 squash-merged as
`95949887b6ace793f0c33156a2dceec0c4ff1916` after exact-head GitHub Actions
run `31817168998` passed all required gates.

## Context

G3.21 provides transactional inbox deduplication, G3.22 produces six accepted
reservation event types, and G3.23 provides the provider-neutral delivery
queue. No accepted consumer currently bridges those boundaries. Supporting
every reservation transition at once would expand the first workflow before
recipient resolution and composition have been accepted.

## Decision

- The first reservation notification workflow consumes only
  `inventory.reservation.ready` version 1 with aggregate type
  `MedicineReservation`.
- The consumer accepts only a tenant ID and event ID, then reloads the
  immutable event from PostgreSQL inside the G3.21 serializable inbox
  transaction. Caller-supplied event payloads are not trusted.
- The version-1 payload schema is exact and fail-closed: `providerId`,
  `previousStatus=CONFIRMED`, `status=READY`, positive `version`, and positive
  `totalQuantity`. Unknown fields, names, versions, aggregate types, and invalid
  values are rejected.
- The authoritative reservation must match the event tenant, aggregate, and
  provider. Its subject is mapped to an opaque same-tenant membership
  reference. Contact data is not read or copied.
- The same inbox transaction enqueues one G3.23 delivery intent for workflow
  `reservation-ready-membership-v1`, channel `EMAIL`, template
  `reservation-ready` version 1, and the single structured variable
  `status=READY`.
- Any event, reservation, membership, or queue failure rolls back the inbox
  receipt. Duplicate or replayed consumption performs no second effect.
- This contract does not activate an event relay loop, recipient destination
  resolution, message composition, or provider delivery.

## Reason

Reservation-ready is the smallest useful notification transition and already
has a stable G3.22 event. Reloading the event inside the inbox transaction
prevents a forged in-memory envelope from creating a queue row. Deriving only
an opaque membership reference preserves the G3.23 privacy boundary while
leaving transient contact resolution to the next sprint.

## Alternatives

- **Consume all reservation events:** rejected because it multiplies workflow
  and template policy before the first path is proven.
- **Trust a claimed event object supplied to the consumer:** rejected because
  an internal caller could alter fields without proving they came from the
  immutable outbox row.
- **Put the subject or contact data in the G3.22 payload:** rejected by ADR-014
  and the minimal-data principle.
- **Resolve email or call a provider during consumption:** rejected because
  recipient resolution and external delivery are separate boundaries.

## Consequences

- A reservation subject without a same-tenant membership fails closed and the
  event remains unconsumed for this workflow.
- Disabled membership and current destination policy are evaluated later by
  the recipient resolver; queue creation does not claim deliverability.
- Template meaning remains deliberately narrow and will be formalized by the
  bounded composition contract.

## Implementation constraints

1. Use `consumeOutboxEventOnce`; do not create a second deduplication store.
2. Load the authoritative event and reservation within the inbox transaction.
3. Enqueue through the accepted G3.23 primitive in that transaction.
4. Persist no user ID, address, phone, email, message body, clinical data, or
   free text in the event payload, queue variables, or processing evidence.
5. Add PostgreSQL evidence for replay, rollback, tenant isolation, and inbox
   immutability.

## Review triggers

Review when supporting another reservation event/version, a recipient type
other than tenant membership, another channel, public ingestion, replay
authority, or an external provider.