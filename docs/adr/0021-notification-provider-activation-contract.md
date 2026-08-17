# ADR-021 — Notification Provider Activation Contract

- Status: Proposed
- Date: 2026-08-17
- Scope: G3.29 notification provider activation contract

## Context

G3.23 established a provider-neutral notification adapter and registry. G3.27 wired the first bounded reservation notification workflow through that boundary, and G3.28 accepted metadata-only operational visibility. Production still deliberately binds `NOTIFICATION_PROVIDER_REGISTRY` to an unconfigured registry that fails closed with `PROVIDER_UNAVAILABLE`.

The next safe step is to define the activation contract that any future real provider must satisfy without activating a provider, adding credentials, or creating external delivery in this sprint.

## Decision

1. Provider activation is explicit and deny-by-default. Absence, ambiguity, unsupported values, or incomplete configuration must retain the unconfigured fail-closed registry.
2. Activation is channel-scoped. A configured provider for one channel must not implicitly activate any other channel.
3. Provider identity uses a bounded internal provider key. Vendor-specific SDK types, credentials, endpoints, or response payloads must not leak into domain or queue contracts.
4. Provider credentials and secrets must come from the approved runtime secret/config boundary only. They must never be persisted in PostgreSQL, queue variables, domain events, audit metadata, operational views, or logs.
5. Startup/config validation must reject invalid provider keys, unsupported channels, missing required secret references, conflicting activation declarations, and unsafe development fallbacks.
6. The existing `NotificationProviderAdapter` and stable delivery idempotency key remain the delivery contract. A future provider must preserve retry idempotency and return only bounded provider-reference material suitable for hashing before persistence.
7. Provider failures crossing the worker boundary must be normalized to bounded coded outcomes. Raw vendor errors, response bodies, destination data, credentials, and tokens must not enter persisted attempt evidence or structured logs.
8. Provider readiness is separate from PostgreSQL readiness. Configuration may report provider activation state without making external network calls during ordinary application health checks unless a later sprint explicitly approves such checks.
9. Tests for this contract must prove default-off behavior, channel isolation, invalid/missing configuration failure, secret non-disclosure, bounded error mapping, and preservation of the existing unconfigured production default.
10. This ADR does not approve any vendor, credential, network call, external delivery, production rollout, or real-healthcare-data use.

## Consequences

A later provider implementation can be reviewed against one explicit activation boundary rather than wiring vendor configuration directly into the worker. Current deployments remain unable to send externally until a separate provider implementation and activation sprint is approved, implemented, validated, and accepted.
