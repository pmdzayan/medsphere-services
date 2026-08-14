# ADR-015: Provider-Neutral Notification Delivery Foundation

**Status:** Accepted

**Date:** 2026-08-14

**Decision owners:** MedSphere Project Owner and CTO

**Depends on:** ADR-001, ADR-003, ADR-004, ADR-006, ADR-008, ADR-013, ADR-014

## Context

G3.21 and G3.22 provide durable event delivery and atomic inventory producers,
but MedSphere still has no tenant-safe notification delivery queue, recipient
resolution boundary, provider contract, attempt evidence, or operational view.
Calling a provider from a domain transaction would break atomicity. Persisting
plaintext email addresses or phone numbers in a queue would unnecessarily copy
personal data and make retries, logs, and dead-letter evidence higher risk.

## Decision

- The V1 modular monolith owns a tenant-scoped `NotificationDelivery` queue and
  append-only `NotificationDeliveryAttempt` evidence.
- A delivery stores only a recipient type and opaque recipient reference. A
  resolver obtains the current destination transiently at delivery time. The
  queue and evidence never store plaintext email addresses, phone numbers,
  message bodies, credentials, provider responses, or event payloads.
- A provider-neutral adapter receives a channel, transient destination token,
  allowlisted template reference, bounded variables, and stable idempotency key.
- Workers claim bounded batches with `FOR UPDATE SKIP LOCKED` and lease tokens.
  Provider calls happen outside database transactions. Success or coded failure
  is then recorded atomically with append-only attempt evidence.
- Delivery is at least once. Retries use bounded exponential backoff and become
  dead letters after a bounded maximum. Exactly-once provider delivery is not
  claimed.
- Operations may read tenant-scoped metadata and aggregate status only. They
  cannot read destinations, variables, provider payloads, or credentials, and
  this foundation adds no replay mutation.
- No real provider, recipient policy, notification workflow, public endpoint,
  broker, template body, Maps integration, FHIR mapping, or ABDM integration is
  selected by this foundation.

## Five bounded work items

1. Provider-neutral notification contract and domain validation.
2. Tenant-safe recipient and routing boundary with opaque references.
3. Leased delivery worker and provider adapter abstraction.
4. Idempotency, bounded retries, dead-letter handling, and delivery evidence.
5. Operational security, safe observability, and read-only admin boundary.

## Reason

This is the smallest foundation that lets later workflows consume accepted
events without coupling inventory, users, or future clinical domains to a
vendor. Opaque recipient references reduce copied personal data, while leases,
stable idempotency keys, and immutable evidence make provider retries
inspectable without claiming impossible cross-provider exactly-once behavior.

## Alternatives

- **Send directly from inventory services:** rejected because provider latency
  and failure cannot participate in the authoritative transaction.
- **Store rendered bodies and destinations in the queue:** rejected because it
  duplicates personal data and increases dead-letter and log exposure.
- **Use the outbox row as provider delivery state:** rejected because one domain
  event may later create multiple channel and recipient deliveries.
- **Select email, SMS, or WhatsApp now:** rejected because credentials,
  commercial terms, consent, templates, and production operations are not
  accepted.
- **Deploy the existing notification-service skeleton as a microservice:**
  rejected because ADR-001 keeps V1 in the modular monolith and the repository
  has not accepted an independent notification deployment boundary.

## Consequences

- A later workflow must resolve approved recipients and enqueue one or more
  delivery records idempotently from an accepted event.
- Provider adapters and recipient resolvers remain injectable and replaceable.
- Dead-letter recovery, template administration, preferences, consent, and
  production credentials require later bounded contracts.

## Implementation constraints

1. Tenant identity comes from trusted event or operator context, never message
   variables.
2. Recipient references, workflow keys, template keys, provider keys, and error
   codes are bounded identifiers.
3. Template variables are plain JSON objects with sensitive keys rejected and a
   strict size limit.
4. Workers never log destinations, variables, credentials, provider payloads,
   or raw exceptions.
5. A stale lease cannot record success or failure.
6. Attempt evidence is append-only and cannot be deleted.
7. Operational reads are tenant-scoped, paginated, and omit sensitive fields.

## Review triggers

Review when adding a real provider, rendered content, contact persistence,
preferences or consent, patient recipients, delivery replay, public APIs,
provider webhooks, template administration, regional routing, or a separate
deployment.
