# UM14.1 — Blue/Green Environment & Role Model

## Purpose

UM14.1 establishes the fail-closed state machine for AIM's reusable BLUE/GREEN production slots. It prevents the dangerous interpretation that "BLUE is always live" or that both databases may accept writes during an update.

## Roles

- `ACTIVE`: the only environment allowed to own production database write authority.
- `CANDIDATE`: the inactive environment after it has been synchronized from the current ACTIVE release and prepared for the next release.
- `ROLLBACK`: the previous known-good environment retained after promotion.

Colors are identities, not roles. A normal release cycle is:

`BLUE ACTIVE / GREEN ROLLBACK -> BLUE ACTIVE / GREEN CANDIDATE -> GREEN ACTIVE / BLUE ROLLBACK`

The next release performs the reverse after BLUE is freshly synchronized from GREEN.

## Repository contract

The executable policy is `docs/architecture/blue-green-environment-role-policy.json`.

Focused validation:

```bash
pnpm test:blue-green-role-model
```

Validate an operator-produced state manifest:

```bash
node scripts/blue-green-environment-role-model.mjs state <state.json>
```

Validate a proposed transition:

```bash
node scripts/blue-green-environment-role-model.mjs transition <before.json> <after.json>
```

## Safety boundary

UM14.1 does **not** copy databases, configure replication, shift traffic, dual-write, perform schema migration, or deploy to production. Those actions remain blocked until their later Milestone 14 tasks and Task 0050 external evidence are satisfied.

The state contract stores only opaque database identities and evidence references. Never place a `DATABASE_URL`, credentials, tokens, patient data, pharmacy customer data or raw security findings in it.

## Accepted transitions

### Prepare inactive environment

- ACTIVE environment and release stay unchanged.
- Inactive role changes from ROLLBACK to CANDIDATE.
- Candidate receives the next release identity.
- Candidate declares synchronization evidence bound to the current ACTIVE environment and release.
- Write authority remains with ACTIVE.

### Promote candidate

- Previous CANDIDATE becomes ACTIVE with the same candidate release SHA.
- Previous ACTIVE becomes ROLLBACK with its release SHA preserved.
- Write authority moves to the newly ACTIVE environment.
- A direct ROLLBACK-to-ACTIVE swap fails closed.

## Follow-on dependency

UM14.2 must implement the synchronization/candidate-creation mechanism that produces the evidence consumed by this role model. Until then, UM14.1 is a governance and validation foundation, not a production blue/green switch.
