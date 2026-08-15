# ADR-017: Reservation Notification Recipient Resolution

**Status:** Proposed

**Date:** 2026-08-15

**Decision owners:** MedSphere Project Owner and CTO

**Depends on:** ADR-003, ADR-004, ADR-015, and ADR-016

## Context

G3.24 queues one reservation-ready notification intent using an opaque
same-tenant membership reference. G3.23 deliberately keeps contact information
out of durable notification records and requires destination resolution at
worker execution time. The next boundary must resolve that opaque reference
without turning the event or queue into a contact-data store or creating a
cross-tenant lookup oracle.

## Decision

- G3.25 resolves only `TENANT_MEMBERSHIP` recipients for the `EMAIL` channel.
- The resolver accepts only the tenant ID, recipient type, opaque membership ID,
  and channel already present in the G3.23 worker contract.
- The membership lookup is constrained by both membership ID and tenant ID.
  Missing and cross-tenant references return the same coded
  `RECIPIENT_UNAVAILABLE` failure.
- A recipient is deliverable only when the tenant is active and not deleted,
  the membership is `ACTIVE`, not ended, and not deleted, and the user is
  `ACTIVE` and not deleted.
- Same-tenant recipients that exist but are not currently deliverable return
  the coded `RECIPIENT_DISABLED` failure.
- The resolver selects only the state required to prove deliverability plus the
  email destination. It does not load names, phone numbers, privacy profile,
  clinical data, reservation data, or other user attributes.
- The email destination exists only in process memory for the provider-neutral
  worker call. It must not be written back to the outbox, inbox, notification
  queue, delivery evidence, logs, metrics, or errors.
- Unsupported recipient types, unsupported channels, malformed references, and
  invalid stored destinations fail closed with bounded coded errors.
- No real notification provider is activated by this decision.

## Reason

The accepted G3.23 queue is intentionally privacy-minimal. Resolving the
current destination just in time lets membership revocation, account status,
and tenant status take effect before an external adapter can receive a
destination. Constraining the query by tenant and using a shared unavailable
failure prevents cross-tenant existence disclosure.

## Alternatives

- **Copy email into the G3.24 event or queue:** rejected because it creates a
  durable contact-data copy and makes revocation or contact changes stale.
- **Resolve by user ID:** rejected because G3.24 intentionally exposes only an
  opaque tenant-membership reference and tenant membership is the authorization
  boundary.
- **Resolve every notification channel now:** rejected because SMS, WhatsApp,
  push, operational routes, and channel-preference policy require separate
  contracts.
- **Call a real email provider from the resolver:** rejected because recipient
  resolution and provider delivery are separate G3.23 boundaries.

## Consequences

- A queued notification may become undeliverable after queue creation if the
  tenant, membership, or user is disabled; the worker records only the coded
  metadata-safe failure.
- Cross-tenant and missing references are intentionally indistinguishable.
- Communication preferences beyond current account/membership eligibility are
  not invented by this sprint and require a later accepted policy boundary.
- The provider registry remains fail closed, so successful resolution does not
  imply external delivery is operational.

## Implementation constraints

1. Reuse `NotificationRecipientResolver`; do not create another worker or
   delivery queue.
2. Query `TenantMembership` by both `id` and `tenantId` and select only the
   minimum required fields.
3. Do not add a schema migration unless an implementation blocker proves one is
   required.
4. Do not log, persist, hash for operations, or expose the resolved email.
5. Add unit tests for supported and fail-closed outcomes and real PostgreSQL
   evidence for tenant isolation, stale/disabled recipients, and concurrent
   deterministic resolution.

## Review triggers

Review this decision before adding another recipient type, another channel,
communication-preference enforcement, operational routing, an external contact
directory, provider activation, or any durable destination storage.
