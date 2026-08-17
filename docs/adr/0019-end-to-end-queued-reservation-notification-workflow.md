# ADR-019 — End-to-End Queued Reservation Notification Workflow

**Status:** Proposed

## Context

G3.21 established durable inbox/outbox processing, G3.23 established the provider-neutral notification queue and worker, G3.24 consumes the accepted reservation-ready event, G3.25 resolves an opaque tenant membership recipient, and G3.26 defines deterministic reservation-ready composition. Those components were intentionally accepted independently and were not yet wired into one delivery path.

## Decision

For the first bounded reservation notification workflow, the notification worker must compose queued template data through the accepted reservation composer before invoking any provider adapter. The provider adapter receives the stable delivery ID as its idempotency key together with the transient resolved destination and the deterministic composed content.

The production module continues to bind the unconfigured provider registry. Therefore this decision proves workflow wiring without activating external delivery.

The complete path is:

`inventory.reservation.ready v1 -> durable inbox consumption -> idempotent notification queue -> tenant-scoped membership resolution -> deterministic reservation-ready composition -> provider-neutral adapter -> append-only delivery outcome evidence`.

## Safety properties

- no provider call occurs inside the reservation transaction;
- duplicate event consumption cannot enqueue duplicate logical deliveries;
- concurrent workers rely on leased `SKIP LOCKED` claiming;
- retries reuse the stable notification delivery ID as the adapter idempotency key;
- unsupported templates or variables fail closed before provider invocation;
- recipient contact data is resolved transiently and is not copied into events or queue rows;
- production remains fail closed while the unconfigured provider registry is bound;
- delivery attempts remain append-only metadata evidence.

## Consequences

A safe test adapter can prove end-to-end behavior, concurrency, and retry idempotency. This ADR does not approve a real email/SMS/WhatsApp/push provider, production deployment, or real healthcare data.
