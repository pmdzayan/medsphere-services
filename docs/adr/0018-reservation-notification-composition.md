# ADR-018: Reservation Notification Composition Contract

**Status:** Proposed

**Date:** 2026-08-16

**Decision owners:** MedSphere Project Owner and CTO

**Depends on:** ADR-015, ADR-016, and ADR-017

## Context

G3.24 creates one bounded reservation-ready notification intent and G3.25
resolves its opaque tenant-membership recipient at delivery time. The next
boundary must define deterministic, privacy-minimal notification composition
before any end-to-end workflow or real provider can be considered.

## Decision

- G3.26 supports only template key `reservation-ready`, version `1`.
- The only accepted variable is `status` with the exact value `READY`.
- Arbitrary free text and unexpected variables fail closed.
- The initial locale is explicit `en`; unsupported locales fail closed. The
  contract leaves a locale boundary without creating a localization platform.
- Composition produces a channel-neutral subject/body pair plus bounded
  metadata.
- Content is intentionally operational and generic. It includes no medicine
  name, patient name, contact data, prescription, diagnosis, clinical detail,
  provider detail, or reservation detail.
- Composition failures are coded and must not echo rejected values.
- No real provider is activated and G3.26 does not wire the full event-to-delivery
  workflow.

## Reason

A narrow deterministic contract prevents queued variables from becoming an
arbitrary message channel and keeps the first notification workflow
privacy-minimal. Explicit template identity, version, locale, and variable
allowlisting also make future changes reviewable and replay-safe.

## Alternatives

- **General-purpose template engine:** rejected because it expands scope and
  creates an unnecessary content-injection surface.
- **Free-text message body in the queue:** rejected because durable arbitrary
  text can leak private or clinical information.
- **Include medicine or patient details:** rejected because the first workflow
  does not require them.
- **Implement multiple locales now:** rejected because localization policy and
  translations require separate acceptance.

## Consequences

- G3.27 may wire this composer into the provider-neutral worker only after G3.26
  acceptance.
- Any new variable, locale, template, or content class requires review.
- The first message is intentionally generic.

## Implementation constraints

1. No schema migration.
2. No arbitrary free-text input.
3. Reject every variable set except `{ status: 'READY' }`.
4. Keep output deterministic for the same accepted input.
5. Use metadata-safe coded failures that never echo rejected values.
6. Add contract and snapshot tests.
7. Do not activate a real provider or implement G3.27 in this sprint.

## Review triggers

Review this ADR before adding another template, variable, locale, content class,
clinical field, provider-specific content, or dynamic free text.
