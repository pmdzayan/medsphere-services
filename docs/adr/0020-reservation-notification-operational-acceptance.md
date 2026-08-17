# ADR-020 — Reservation Notification Operational Acceptance

- Status: Proposed
- Date: 2026-08-17
- Scope: G3.28 reservation notification operational acceptance

## Context

G3.27 established the first bounded queued reservation notification workflow. Operational acceptance now requires authorized tenant-scoped reads, metadata-only delivery evidence, bounded status visibility, correlation/event identifiers, database readiness, and privacy-safe operational logging without activating a real provider or exposing message/recipient data.

## Decision

1. Operational reads are authorized against an active tenant membership matching tenant, membership, and user identifiers.
2. Delivery views expose only bounded metadata: delivery/event identifiers, workflow/template identifiers, channel, delivery status, attempt counts/timestamps, correlation ID, coded failures, and append-only attempt outcomes.
3. Recipient references, contact details, queued variables/message bodies, lock tokens, and provider references are excluded from operational views.
4. Status metrics are tenant-scoped and bounded to the five accepted notification delivery states.
5. Readiness proves PostgreSQL reachability and fails closed by propagating dependency failure.
6. Structured operational logs contain identifiers/status/limits only and never recipient/contact/message payloads.
7. No real provider, production deployment, or real-healthcare-data approval is implied by this acceptance boundary.

## Consequences

The first reservation notification workflow can be operated and diagnosed without disclosing message content or recipient contact data. Cross-tenant operational reads fail closed, retry/dead-letter state remains visible, and health checks distinguish database availability from provider activation.
