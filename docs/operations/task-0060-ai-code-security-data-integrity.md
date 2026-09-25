# Task 0060 — Independent AI-Code Security & Data-Integrity Gate

## Purpose

Task 0060 adds a repository-controlled second line of defense for AI-assisted and other high-risk changes. It does not assume that generated code is safe because it compiles, has tests, or was written by a capable model.

The gate has two layers:

1. **hard failures** for configured unsafe additions;
2. **independent review** for high-risk healthcare, security, tenant, database, and gate-integrity changes.

## Reused AIM controls

Task 0060 deliberately reuses rather than replaces:

- tenant-safe RBAC and provider access guards;
- exact-user audit requirements;
- transaction/concurrency tests;
- clean and populated database-upgrade verification;
- production dependency audit;
- architecture, runtime, network, backup/recovery, and release certification;
- the existing PR Quality Gate.

The new gate is additive. Passing Task 0060 does not waive any older AIM control.

## High-risk classification

The machine-readable policy is:

`docs/architecture/ai-code-security-data-integrity-policy.json`

Production changes under these surfaces require independent approval:

- `apps/auth-service/src/`;
- `apps/web/src/app/api/`;
- `packages/security/`;
- Prisma schema and migrations;
- Task 0060's own enforcement files;
- diffs matching configured trust-context, raw-HTML, transaction, locking, or tenant-scope review signals.

Test/spec files do not become high risk merely because they live under the backend or BFF paths. A production file changed in the same PR still triggers review.

## Hard-fail classes

The gate currently rejects configured additions for:

- private keys / recognizable live secrets;
- unsafe Prisma raw-query APIs;
- runtime `eval` / dynamic function creation;
- child-process execution in production application/package code;
- disabled TLS certificate verification;
- destructive Prisma migration SQL without a valid exception.

A hard failure cannot be overridden by PR approval alone.

## Destructive migration exception contract

A legitimate destructive migration must add a narrow entry under `policy.exceptions` containing:

- unique exception ID;
- exact hard-fail rule ID;
- exact migration path;
- existing Accepted ADR path;
- expiration timestamp.

The referenced ADR must document why the destructive operation is necessary, populated-upgrade/data-preservation behavior, backup/recovery, rollout, and rollback. Since the policy file itself is a high-risk surface, the exception also requires independent review.

## Independent approval contract

The dedicated workflow reads GitHub pull-request reviews through a read-only token. For a high-risk diff it requires at least one reviewer whose:

- login differs from the PR author;
- account is not a bot;
- latest review state is `APPROVED`.

The workflow reruns when reviews are submitted, edited, or dismissed. If a reviewer later requests changes, their earlier approval no longer counts.

## Commands

Focused policy/unit tests plus repository boundary:

```bash
pnpm test:ai-code-security-gate
```

Repository boundary only:

```bash
node scripts/ai-code-security-data-integrity-gate.mjs boundary
```

Change-aware PR gate:

```bash
node scripts/ai-code-security-data-integrity-gate.mjs diff \
  --base <base-sha> \
  --head <head-sha> \
  --author <pr-author> \
  --reviews <reviews-json>
```

The boundary tests and live boundary are also part of `pnpm test:architecture`, so the normal Quality Gate catches missing/disabled Task 0060 enforcement.

## Failure interpretation

`Hard security failure [...]` means the diff contains a configured unsafe addition. Fix the implementation or add a narrowly approved exception where the policy permits one.

`Independent approval required...` means the diff is high risk but there is no valid approval from somebody other than the PR author; request/approval signals and expired waivers fail.

`repository boundary` failures mean Task 0060's workflow, command wiring, policy, required documentation, or forbidden secret-file boundary drifted.

Do not solve a failure by deleting the gate from the Quality Gate, weakening the regex, broadening an exception, or moving sensitive logic to an unscanned path.

## Bootstrap

The policy contains one bounded installation waiver for the initial Task 0060 pull request. It is restricted to the exact pre-0060 authoritative SHA, a small file allowlist, and a fixed expiry. It does not disable hard failures and cannot be reused after the base branch advances.

## Repository enforcement note

The workflow produces enforceable pass/fail status. Server-side prevention of a manual administrator merge additionally depends on GitHub branch protection/rulesets requiring the Task 0060 check. Repository governance must not treat an unprotected branch as equivalent to an enforced review policy.

## Out of scope

- claiming that static analysis proves clinical correctness;
- replacing human security/privacy/compliance review;
- introducing a new runtime security service;
- storing patient data in CI;
- automatic diagnosis/prescribing decisions;
- relaxing Task 0050 production-release evidence;
- implementing Tasks 0052–0057 connected-healthcare product workflows.
