# ADR-0032: Independent AI-Code Security and Data-Integrity Gate

**Status:** Accepted

**Date:** 2026-09-25

**Decision owners:** AIM Project Owner and CTO

## Decision

AIM will treat AI-assisted code as untrusted until it passes the same repository-controlled security and data-integrity boundaries as any other change. Changes to high-risk healthcare surfaces require an **independent approval** from a reviewer other than the pull-request author, while clearly dangerous additions fail automatically regardless of approval.

Task 0060 makes this decision executable through:

- `docs/architecture/ai-code-security-data-integrity-policy.json`;
- `scripts/ai-code-security-data-integrity-gate.mjs`;
- `scripts/ai-code-security-data-integrity-gate.spec.mjs`;
- `.github/workflows/ai-code-security-data-integrity.yml`;
- the mandatory `pnpm test:architecture` quality gate.

The gate is intentionally change-aware. It evaluates the pull-request diff rather than pretending a static scanner can infer the safety of every existing healthcare workflow.

## Reason and context

AIM increasingly uses coding agents to accelerate implementation. That raises a specific governance risk: generated code can look plausible while quietly weakening authorization, accepting client-supplied tenant context, bypassing transactions, introducing raw SQL or injection surfaces, leaking credentials, or applying a destructive migration without preserving live data.

The existing repository already has strong domain-specific protections: tenant-qualified repositories, authorization guards, exact-user audit behavior, populated-upgrade verification, transaction/concurrency tests, runtime certification, and release gates. Task 0060 does not replace those controls. It adds an independent change gate above them so risky edits cannot rely only on the implementing agent's own assessment.

## High-risk surfaces

Independent approval is required when production changes touch:

1. `apps/auth-service/src/` production code;
2. browser BFF/API routes under `apps/web/src/app/api/`;
3. shared security code under `packages/security/`;
4. Prisma schema or migration history;
5. the Task 0060 policy, checker, workflow, quality-gate wiring, package command, or binding project rules themselves;
6. any diff containing configured trust, injection, transaction, locking, or tenant-isolation review signals.

Test-only changes are excluded from path-only escalation, but tests cannot authorize a production security exception.

## Automatic hard failures

Independent approval is not enough to authorize additions matching a configured hard-fail rule. The initial policy blocks:

- private-key material and recognizable live credential shapes in sensitive source/configuration;
- Prisma `$queryRawUnsafe` / `$executeRawUnsafe` use in production code;
- runtime `eval` / `new Function` in production code;
- production child-process execution;
- explicit TLS certificate-verification disabling;
- destructive migration statements such as `DROP`, `TRUNCATE`, `DELETE FROM`, and `ALTER TABLE ... DROP COLUMN` without a bounded exception.

A future legitimate exception must be exact-path, exact-rule, time-bounded, and backed by an existing **Accepted ADR**. Editing the exception policy itself is a high-risk gate-integrity change and therefore requires independent approval.

## Independent review semantics

For a high-risk pull request:

- the approving reviewer must not be the pull-request author;
- bot approvals do not count;
- the reviewer's latest submitted review state must be `APPROVED`;
- a later `CHANGES_REQUESTED` review invalidates that reviewer's earlier approval;
- the dedicated workflow reruns on review submission, edit, and dismissal.

This is independent review evidence, not an assertion that the reviewer found every possible defect. Existing tests, database verification, runtime certification, and release controls remain mandatory.

## Bootstrap constraint

The first installation of a gate cannot require a gate that does not yet exist. Therefore the Task 0060 policy contains a one-time bootstrap waiver limited to:

- authoritative base `ce836f12d20d30351678b19ea525d7dd34f28bce`;
- an explicit allowlist containing only Task 0060 governance files;
- expiration at `2026-09-27T00:00:00.000Z`.

The waiver suppresses only the independent-review requirement for this bootstrap change. Automatic hard-fail checks remain active. After the authoritative branch advances or the time window expires, the waiver cannot authorize later changes.

## Alternatives

### Trust the implementing AI agent's self-review

Rejected. Self-review is useful but not independent evidence and can reproduce the same mistaken assumption that created the defect.

### Require human review for every file

Not selected. That would create noise and encourage rubber-stamping. Task 0060 focuses the additional approval requirement on healthcare authority, tenant/data integrity, security, database, and gate-integrity surfaces.

### Use only a third-party security scanner

Rejected as the sole control. General scanners are useful but do not understand AIM's tenant, authorization, transaction, migration, and healthcare boundaries. They may be added later as supplemental evidence.

### Allow destructive migrations after normal PR approval

Rejected. Destructive data operations need explicit, time-bounded design evidence because a normal code review does not prove populated-upgrade safety, recovery, or data preservation.

## Consequences

### Positive

- High-risk AI-assisted code cannot rely solely on its author's judgment.
- Obvious secret, injection, raw-SQL, TLS, process-execution, and destructive-migration hazards fail before merge review can excuse them.
- Auth, tenant, healthcare API, security, and database changes receive explicit independent scrutiny.
- Changes that weaken the gate itself are covered by the gate after bootstrap.
- The policy remains repository-native, testable, and reviewable without adding a new runtime service.

### Costs and trade-offs

- High-risk pull requests need another qualified reviewer before the Task 0060 workflow turns green.
- Static pattern rules can produce false positives; exceptions therefore require narrow, expiring evidence rather than disabling a rule globally.
- GitHub repository settings must make the dedicated workflow a required check for server-side merge enforcement. The repository-level workflow still reports failures even if an administrator has not enabled branch protection.
- The gate does not replace threat modeling, dependency scanning, penetration testing, compliance review, or production release approval.

## Implementation constraints

- Never treat browser-supplied tenant, organization, membership, provider, role, or authorization context as trusted merely because it passed client validation.
- Authorization must remain server-side, deny-by-default, and tenant-qualified.
- Inventory, reservation, billing, clinical, audit, and other state transitions that require atomicity must retain the accepted transaction/locking/idempotency semantics.
- Migrations must preserve supported populated upgrades; destructive operations require explicit accepted design and recovery evidence.
- Secrets, private keys, real patient data, and production credentials must never be committed for scanner convenience or test fixtures.
- The Task 0060 policy, checker, workflow, and quality-gate wiring are themselves high-risk review surfaces.
- Do not weaken a hard-fail rule or broaden an exception merely to make CI green.

## Review triggers

Review ADR-032 when:

- AIM adopts a new code-generation system or autonomous implementation agent;
- false-positive/false-negative evidence shows a rule needs refinement;
- new healthcare domains introduce additional authority or data-integrity surfaces;
- database technology, migration strategy, or transaction semantics materially change;
- branch-protection/ruleset capabilities change;
- a security incident reveals a missing change-control category;
- a supplemental SAST, secret-scanning, or policy engine is proposed.
