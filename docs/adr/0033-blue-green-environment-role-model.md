# ADR-033: Blue/Green Environment Role Model

**Status:** Accepted  
**Date:** 2026-09-26  
**Task:** UM14.1

## Decision

AIM will use two reusable production environment slots named **BLUE** and **GREEN**. The color is a physical slot identity only; it is never a permanent production role.

At any accepted state:

- exactly one environment is `ACTIVE`;
- only the `ACTIVE` environment owns database write authority;
- the other environment is either `ROLLBACK` or `CANDIDATE`;
- a `CANDIDATE` must carry bounded evidence that it was synchronized from the current `ACTIVE` release;
- a `ROLLBACK` environment cannot become `ACTIVE` directly;
- promotion is allowed only from `CANDIDATE`, and the former `ACTIVE` becomes `ROLLBACK`.

The repository expresses this contract through
`docs/architecture/blue-green-environment-role-policy.json` and
`scripts/blue-green-environment-role-model.mjs`.

## Reason and context

AIM needs repeatable upgrades without assigning one database permanently to "live" and the other permanently to "testing." Permanent color-to-role coupling creates stale-data and operator-confusion risks. Healthcare, reservation, inventory and POS integrity also make split-brain writes unacceptable.

This task defines identity and transition rules only. It does not copy production data, activate provider replication, route real traffic, or authorize production use.

## Alternatives

1. Keep BLUE permanently live and GREEN permanently test-only. Rejected because the inactive side would age and rollback/update semantics would become ambiguous.
2. Permit both environments to accept writes during a canary. Rejected because UM14.1 cannot prove safe conflict resolution for inventory, reservations, billing, audit and future clinical records.
3. Create a fresh third environment for every release. Rejected as unnecessary operational complexity before measured need.

## Consequences

BLUE and GREEN can safely swap roles across releases. Operators must track release identity, database identity and generation rather than assuming a color is production. Candidate preparation requires synchronization evidence, and promotion moves write authority atomically with the role.

The previous live environment remains a rollback slot after promotion, but database downgrade is not implied. Recovery and schema compatibility continue to follow existing Task 0022/0023/0050 controls.

## Implementation constraints

- No database connection URLs, secrets, credentials, PHI or raw review findings are stored in the role manifest.
- Database references are opaque bounded identities only.
- No direct `ROLLBACK -> ACTIVE` transition.
- No two `ACTIVE` roles and no candidate write authority.
- Candidate synchronization is evidence-only in UM14.1; the actual synchronization mechanism belongs to the next blue/green task.
- Traffic percentages, shadowing and progressive canary routing are out of scope here.
- Existing production release certification and migration safety remain authoritative.

## Review triggers

Review this ADR if AIM introduces multi-region active/active writes, database conflict resolution, more than two production slots, provider-native blue/green primitives with different safety semantics, or a measured need that invalidates single-write authority.
