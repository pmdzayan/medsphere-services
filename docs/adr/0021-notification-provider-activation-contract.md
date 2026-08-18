# ADR-021 — Notification Provider Activation Contract

- Status: Proposed
- Date: 2026-08-17
- Scope: G3.29 notification provider activation contract

## Context

G3.23 established a provider-neutral notification adapter and registry. G3.27 wired the first bounded reservation notification workflow through that boundary, and G3.28 accepted metadata-only operational visibility. Production still deliberately binds `NOTIFICATION_PROVIDER_REGISTRY` to an unconfigured registry that fails closed with `PROVIDER_UNAVAILABLE`.

The next safe step is to define the activation contract that any future real provider must satisfy without activating a provider, adding credentials, or creating external delivery in this sprint.

## Decision

1. `EMAIL` is the first supported provider-activation channel. SMS, WhatsApp, push, or any other channel remains unsupported and must fail closed until separately approved.
2. Provider activation is explicit and deny-by-default. Absence, ambiguity, unsupported values, or incomplete configuration must retain the unconfigured fail-closed behavior.
3. Activation is channel-scoped. A configured provider for one channel must not implicitly activate any other channel, and no silent provider/channel fallback is permitted.
4. Provider identity uses a bounded internal provider key. Vendor-specific SDK types, credentials, endpoints, or response payloads must not leak into domain or queue contracts.
5. Provider credentials and secrets come only from the approved injected runtime secret/config boundary. Configuration stores a credential reference/name, not the secret value. Secrets must never be persisted in PostgreSQL, queue variables, domain events, audit metadata, operational views, metrics, health responses, or logs.
6. Startup/config validation rejects invalid provider keys, unsupported channels, missing or malformed credential references, conflicting disabled configuration, unsafe fallbacks, and network timeouts outside the approved 250 ms–10 s range. The default provider timeout is 5 s.
7. The existing `NotificationProviderAdapter` remains the provider-neutral delivery boundary. The MedSphere notification delivery ID remains the logical idempotency key; provider-generated identifiers never establish logical identity or tenant authority.
8. Provider acknowledgements normalize to `ACCEPTED`, `REJECTED`, or `UNKNOWN`. Provider failures normalize to bounded coded outcomes classified as `TRANSIENT` or `TERMINAL`. Raw vendor errors, response bodies, destination data, credentials, and tokens must not enter persisted attempt evidence or structured logs.
9. Provider references may cross the adapter boundary only as bounded volatile material suitable for hashing before persistence. Raw provider references are not operational evidence.
10. Provider capability health is represented independently as `DISABLED`, `READY`, `DEGRADED`, or `UNAVAILABLE`. Ordinary health/readiness does not send notifications or perform provider network probes unless a later sprint explicitly approves such probes.
11. A provider response, acknowledgement, or routing hint never creates tenant authority. Tenant identity and authorization must be established by MedSphere before provider selection.
12. Circuit-open or temporary provider-unavailable conditions must surface as coded unavailable/degraded outcomes and must never trigger silent fallback.
13. Tests for this contract prove default-off behavior, explicit EMAIL selection, channel isolation, invalid/missing configuration failure, secret non-disclosure, exact provider matching, bounded error mapping, and preservation of the existing unconfigured production default.
14. This ADR does not approve any vendor, credential, SDK, endpoint, network call, external delivery, production rollout, or real-healthcare-data use.

## Implementation boundary

`notification-provider-activation.contracts.ts` contains the bounded activation declaration, timeout limits, safe configuration view, typed acknowledgement/failure/readiness models, and an exact-match fail-closed registry for contract validation. The production Nest binding is intentionally unchanged in G3.29, so no external provider is activated.

The companion threat/failure model is `docs/security/G3.29-notification-provider-threat-failure-model.md`.

## Consequences

A later provider implementation can be reviewed against one explicit activation boundary rather than wiring vendor configuration directly into the worker. Current deployments remain unable to send externally until a separate provider implementation and activation sprint is approved, implemented, validated, and accepted.
