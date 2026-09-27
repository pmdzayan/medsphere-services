# ADR-035: Solo-Maintainer High-Risk Change Governance

**Status:** Accepted

**Date:** 2026-09-27

**Decision owners:** AIM Project Owner and CTO

**Supersedes:** ADR-032 human-review-only approval semantics while retaining Task 0060 hard-fail rules and independent human review as the preferred path.

## Decision

AIM will permit two valid approval paths for Task 0060 high-risk changes:

1. **Independent human review**, unchanged from ADR-032, where a non-author, non-bot reviewer's latest state is `APPROVED`.
2. **Solo-maintainer independently evidenced review**, available only to an explicitly authorized repository maintainer when no independent reviewer is available.

The solo path is fail-closed and requires all of the following:

- the PR author is listed in the Task 0060 policy's `authorizedMaintainers`;
- the exact 40-character head SHA has at least 12 hours of GitHub-hosted workflow-run history;
- after that cooling period, the same authorized maintainer posts the exact pull-request comment `AIM-SOLO-REVIEW: <head-sha>`;
- the comment is server-timestamped after the cooling period and bound to the unchanged head;
- production dependency audit passes from the locked dependency graph;
- first-party GitHub CodeQL JavaScript/TypeScript analysis passes;
- Task 0060 policy/unit/boundary tests pass;
- configured diff hard-fail rules pass;
- the repository's normal exact-head quality, migration/upgrade, runtime, backup, performance, and applicable release certifications remain required.

Any new commit changes the head SHA, invalidates the attestation, and starts a new evidence cycle.

## Reason and context

AIM is currently maintained by one project owner without an independent GitHub reviewer. ADR-032's human-only rule correctly prevented self-approval, but it also made every high-risk change permanently unmergeable even when all technical controls were green.

Removing the review requirement would create a weaker system. This ADR instead replaces unavailable human independence with independently generated evidence and a forced separation in time. GitHub supplies the workflow timestamps, the attestation is bound to the exact head, automated scanners remain mandatory, and dangerous patterns remain non-waivable.

The cooling period is intentionally measured from GitHub workflow-run evidence rather than a local commit timestamp so it cannot be satisfied merely by choosing an old local commit date.

## Alternatives

### Disable Task 0060 for a solo maintainer

Rejected. That would remove meaningful protections exactly when the repository has fewer human reviewers.

### Allow immediate self-approval

Rejected. Immediate self-approval provides no independent evidence and no temporal separation from implementation.

### Create a second account controlled by the same maintainer

Rejected. That would imitate independence without creating it.

### Require an external paid reviewer for every high-risk change

Not selected as the only path. Independent human review remains preferred, but making project progress dependent on a currently unavailable person is not operationally viable.

### Use only CodeQL

Rejected. CodeQL is a valuable supplemental control but does not understand AIM's tenant, authorization, inventory, reservation, audit, healthcare, or migration invariants.

## Consequences

### Positive

- Solo maintenance is possible without deleting the high-risk gate.
- Every solo-approved high-risk head receives a forced 12-hour reconsideration window.
- Attestation is tied to an exact immutable head and invalidated by any subsequent code change.
- CodeQL and dependency audit add independent machine-generated evidence.
- Existing Task 0060 hard failures, migration exceptions, AIM tests, and release controls remain intact.
- Independent human approval remains immediately valid when a reviewer becomes available.

### Costs and trade-offs

- High-risk solo changes cannot merge immediately.
- Any new commit restarts the evidence cycle.
- Automated analysis cannot replace expert security, clinical, privacy, or compliance review.
- The authoritative branch is currently not protected by a GitHub ruleset, so process compliance still depends on repository governance until server-side required-check enforcement is configured.

## Transition bootstrap

Changing Task 0060's own approval semantics is itself a high-risk gate-integrity change. The new policy therefore contains a one-time migration waiver restricted to:

- the exact pre-amendment authoritative base `9fc623582059aa01b06163bec4147fbe8fafbe6e`;
- only the Task 0060 governance files listed in `transitionBootstrap.allowedPaths`;
- expiration at `2026-09-29T00:00:00.000Z`.

The waiver does not suppress hard-fail scanning, dependency audit, policy tests, or CodeQL. After the base advances or the expiry passes, it cannot authorize another change.

## Implementation constraints

- The solo path must never become a generic author self-approval.
- Only configured maintainers may use it.
- Workflow-run timestamps and PR comment timestamps must come from GitHub evidence.
- The attestation must match the exact current head SHA.
- Hard-fail rules remain non-waivable by attestation.
- The workflow must run from the exact PR head.
- CodeQL and dependency audit remain part of the dedicated Task 0060 workflow.
- Existing quality gates and production release evidence remain mandatory.
- Adding a new authorized maintainer or weakening the cooling/attestation requirements is itself a high-risk gate-integrity change.

## Review triggers

Review this ADR when AIM gains a regular independent reviewer, moves to an organization with enforced branch rulesets, adds required signed commits, adopts another SAST/policy engine, has a security incident related to solo review, or expands into clinical workflows whose risk requires mandatory external approval.
