# ADR-040: Bounded backend/API compatibility window

## Status

Proposed for UM14.7 acceptance.

## Decision

AIM uses a server-owned inclusive API-generation window for rollout compatibility. Clients declare a bounded positive generation. The backend/BFF may accept multiple adjacent generations simultaneously, allowing controlled overlap while a new release is adopted.

Requests outside the accepted window fail explicitly as upgrade-required. Invalid server policy fails closed. Compatibility generation is metadata only and must never participate in authentication, tenant selection, provider verification, permission evaluation or clinical/business authorization.

## Rationale

Immediately invalidating every older client during a compatible backend deployment creates unnecessary disruption. Indefinite backward compatibility is also unsafe. A bounded window provides a deliberate overlap period with a clear retirement mechanism.

## Consequences

- compatible old/new clients can coexist during rollout;
- operators can retire a generation by advancing the minimum after release gates permit it;
- future/unrecognized generations are rejected rather than guessed compatible;
- UM14.8 remains responsible for database/data-preservation compatibility;
- UM14.10 remains responsible for progressive traffic rollout.
