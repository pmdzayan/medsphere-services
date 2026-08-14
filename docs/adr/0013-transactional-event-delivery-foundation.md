# ADR-013: Transactional Event Delivery Foundation

**Status:** Proposed

**Date:** 2026-08-14

**Decision owners:** MedSphere Project Owner and CTO

**Depends on:** ADR-001, ADR-004, ADR-005, ADR-006, ADR-008

## Context

ADR-008 accepted only a transport-neutral event envelope. The V1 gap audit
blocks notifications, operational analytics, and asynchronous workflows because
there is no atomic outbox, safe relay state machine, or idempotent consumer
receipt. Publishing after a database transaction can lose events; publishing
inside one creates an external side effect that cannot roll back.

## Decision

- `@medsphere/database` owns a tenant-scoped transactional outbox and inbox
  receipt primitive for the V1 modular monolith.
- Domain mutations append an immutable event envelope in the same transaction
  as authoritative state and audit writes.
- Relays claim bounded batches using `FOR UPDATE SKIP LOCKED`, a lease token,
  and stable event IDs. Delivery is at least once; exactly-once is not claimed.
- Retry uses bounded exponential backoff. Only bounded error codes are stored;
  raw provider errors, payloads, credentials, and personal data are excluded
  from failure evidence.
- A consumer records `(consumerName, eventId)` in the same serializable
  transaction as its projection or effect. Duplicate delivery is a no-op.
- The envelope is immutable. Delivery state may change only through the
  constrained state machine; deletion is rejected.
- No external broker or provider is selected by this foundation.

## Reason

This is the minimum durable boundary that prevents event loss between accepted
database mutations and later notifications or analytics. Stable IDs, leased
claims, and transactional receipts make retries safe without a false
exactly-once claim.

## Alternatives

- **Publish directly from controllers or services:** rejected because failure
  between commit and publish loses events.
- **Call providers inside database transactions:** rejected because external
  effects cannot participate safely in PostgreSQL rollback.
- **Adopt a broker immediately:** rejected because V1 has not accepted broker
  operations, tenancy, retention, credentials, or disaster recovery.
- **Use audit events as the queue:** rejected because audit evidence and mutable
  delivery coordination have different integrity and retention requirements.

## Consequences

- Producers must append atomically rather than perform direct network delivery.
- Consumers must use stable names and the inbox primitive before applying an
  effect or projection.
- Dead-letter rows remain durable evidence and require a later permissioned
  recovery contract.
- Notifications and analytics remain incomplete until real producers,
  consumers, and transport adapters are accepted.

## Implementation constraints

1. Tenant identity comes from trusted mutation context, never payload input.
2. Tenant-user attribution uses a tenant-scoped membership foreign key.
3. Payloads are JSON objects capped by the application at 12 KiB and by the
   database at 16 KiB, and contain only producer-approved
   minimum fields.
4. Platform actors are excluded from this tenant outbox contract.
5. Relay failures persist a code, never a raw exception message.
6. Delivery workers must not log payloads or tokens.

## Review triggers

Review when an external broker, cross-region delivery, replay UI, retention,
payload encryption, schema registry, public webhook, or regulated notification
provider is introduced.
