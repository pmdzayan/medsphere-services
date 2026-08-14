# MedSphere Project Status

**Status date:** 2026-08-14

**Accepted source commit:** `bed136eb45649e783815f31cb94f90e11a76aee3`

**Accepted stabilization baseline:** `4ea55a17e188410ddee45fa3ea6c016e22d6617a`

**Current sprint:** G3.21 transactional event delivery foundation candidate

**Release state:** Not approved for production or real healthcare data

**Full-roadmap engineering estimate:** 40% complete / 60% remaining

## Most recent accepted sprint

### G3.20 — Bounded Quarantine Investigation Evidence

**Status:** Accepted and squash-merged in PR #50 as `bed136e` after exact-head
CI run `31769816895` passed all required gates.

**Selection reason:** G3.11 supplied immutable one-way quarantine records, and
assigned-provider access could expose a bounded evidence read without creating
release or disposition authority.

**Boundary:** A permission-protected, assigned-provider, private no-store read
lists immutable quarantine records with bounded operational labels, reason code,
opaque actor-membership attribution, physical quantity, reservation/release
counts, resulting version and occurrence time. Command secrets, names/contact,
release, recall, disposal, approval, supplier, patient, and clinical behavior
were excluded.

**Implementation authority:** accepted G3.11/G3.12 boundaries, accepted source
`bed136e`, and
`docs/sprints/G3.20-bounded-quarantine-investigation-evidence.md`.

## Active implementation candidate

### G3.21 — Transactional Event Delivery Foundation

**Status:** Implemented on a candidate branch; exact-head PostgreSQL CI and CTO
acceptance are required.

**Boundary:** Tenant-scoped immutable outbox envelopes, bounded leased claims,
coded retry/dead-letter transitions, and serializable inbox deduplication. No
broker, transport provider, notification, analytics projection, producer wiring,
replay UI, or production delivery is claimed.

**Implementation authority:** proposed ADR-013 and
`docs/sprints/G3.21-transactional-event-delivery-foundation.md`.

## Earlier accepted sprint

### G3.14 — Live Reservation Lifecycle Actions

**Status:** Accepted and squash-merged in PR #43 as `7feacbb` after exact-head
CI run `31763879935` passed all required gates.

**Accepted boundary:** Exact assigned-provider staff lifecycle commands,
version-safe confirmation, strict receipts, stable idempotency, and authoritative
reservation refresh. No user-triggered expiry, creation, patient, payment,
delivery, or controlled-medicine behavior was added.

## Earlier accepted sprint

### G3.11 — One-Way Manual Batch Quarantine

**Status:** Accepted and squash-merged in PR #38 as `d364794` after exact-head
CI run `31761072418` passed all required gates.

**Selection reason:** The accepted stock read already exposes expiry dates and
batch states, so a separate visibility-only sprint would duplicate working
behavior. Patient reservation creation remains blocked by privacy and authority;
returns need supplier/refund policy; analytics needs event delivery; and full
recall needs a broader regulatory lifecycle. A one-way quality quarantine is
the strongest dependency-ready medicine-safety command.

**Accepted boundary:** Assigned staff may move one active unexpired batch to
`QUARANTINED`, atomically cancel reservations holding it, preserve physical
quantity, and record immutable evidence. Release, recall, disposal, return,
notifications, free-text evidence, and mutation UI are excluded.

**Implementation authority:** ADR-001 through ADR-012, accepted source
`d364794`, and
`docs/sprints/G3.11-one-way-manual-batch-quarantine.md`.

## Previous accepted sprint

### G3.10 — Physical Batch Expiry Reconciliation

**Status:** Accepted and squash-merged in PR #35 as `ad2d15b` after corrected
exact-head CI run `31393057704` passed all required gates.

**Selection reason:** Expired dates already fail availability checks, but
`ACTIVE` batch state and future-dated reservation holds can remain unreconciled.
Returns require supplier/refund policy, analytics requires accepted delivery
infrastructure and policy, patient creation requires privacy/authority, and
quarantine/recall requires a broader lifecycle. G3.10 is the strongest
dependency-ready medicine-safety boundary.

**Accepted boundary:** One bounded non-HTTP worker marks due batches expired,
atomically expires reservations holding them, preserves physical on-hand
quantity, and records immutable tenant-system evidence. It does not claim
physical disposal, alerts, notification delivery, quarantine, recall, or
returns.

**Dependency:** ADR-005, G3.2, G3.7, G3.8, G3.9, and ADR-011 provide batch
authority, reservation allocation release, serializable transactions, and the
accepted physical-expiry contract.

**Implementation authority:** ADR-001 through ADR-011, merged PRs #10–34, the
V1 gap matrix, and
`docs/sprints/G3.10-physical-batch-expiry-reconciliation.md`.

**In scope**

- bounded non-HTTP database-authoritative expiry worker
- atomic expiry of reservations holding a due batch and release of all holds
- physical on-hand preservation with no stock movement
- immutable expiry evidence and tenant-system audit
- real PostgreSQL migration, rollback, idempotency, and concurrency evidence

**Out of scope**

- physical disposal, quarantine, recall, supplier return/refund, or approval
- expiry alerts, notification delivery, analytics, gateway, or frontend UI
- patient reservation creation, partial fulfilment, or controlled medicine
- production deployment or compliance approval

## CTO acceptance ledger

| Area                        | Repository evidence                                                                                       | CTO status                                 |
| --------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Planning and architecture   | ADR-001 and S0.1 governance merged in PR #1                                                               | Accepted baseline                          |
| Monorepo/tooling foundation | PNPM, Turbo, TypeScript, NestJS, Prisma, shared packages, and quality gates exist                         | Accepted stabilization foundation          |
| Database reproducibility    | S0.2–S0.5, G3.1–G3.3, and corrected AG-02A accepted with clean and populated upgrade evidence             | Accepted through `9c38792`                 |
| Identity and tenant context | S0.3 authentication and trusted tenant context merged                                                     | Accepted                                   |
| Authorization and audit     | S0.4 tenant-safe RBAC and durable audit merged                                                            | Accepted                                   |
| Inventory and reservation   | S0.5 and G3.1–G3.14 through live stock safety and reservation lifecycle actions                           | Broader operations remain incomplete       |
| Frontend foundation         | Landing, login, shell, team/RBAC, audit, settings, onboarding, stock, and reservation reads               | Connected for accepted contracts           |
| Pharmacy and inventory UI   | Assigned-provider stock, reservations, overview, quarantine, damage, and lifecycle use accepted contracts | Transfer and broader mutations remain open |
| Remaining healthcare scope  | Most domain deployables are health-only scaffolds or absent                                               | Not implemented                            |

## Critical blockers

1. Quarantine release, patient-safe creation, returns, recall, and analytics
   remain unmounted pending their own accepted contracts and prerequisites.
2. Transfer and broader inventory mutation UIs remain unconnected; accepted
   stock safety and reservation lifecycle commands are live.
3. Consent, privacy operations, verification, retention, legal hold, and the
   policy engine are incomplete.
4. Billing and notification applications are health-only scaffolds; documents,
   workflows, supplier procurement, and analytics are not complete services.
5. Hospital, doctor, laboratory, patient, and clinical journeys do not have
   accepted end-to-end implementations. Medical-record exposure remains blocked
   before consent and privacy controls.
6. Browser E2E, performance/load, penetration, backup/restore, disaster recovery,
   observability, and operational-runbook evidence remain incomplete.
7. Production deployment is intentionally disabled.

Supporting evidence is recorded in [the baseline audit](docs/audits/2026-07-20-cto-baseline.md)
and [the Gates 1–20 verification](docs/audits/2026-08-01-gates-1-20-verification.md).

## Dependency-ordered recovery

1. **S0.1 Architecture and governance** — accepted and merged in PR #1
2. **S0.2 Reproducible database baseline** — accepted and squash-merged in PR #2
3. **S0.3 Authentication and trusted tenant context** — accepted and squash-merged in PR #3
4. **S0.4 Tenant-safe RBAC and durable audit** — accepted and squash-merged in
   PR #7
5. **S0.5 Inventory ledger and reservation integrity** — accepted and merged in
   PR #10 as `410368c`
6. **Frontend Tasks 7–12** — accepted in PR #10 for their implemented contracts
7. **G3.1 trusted provider stock read** — accepted and merged in PR #11 as
   `77689b5`
8. **G3.2 trusted inventory stock commands** — accepted and merged in PR #12
   as `3249f8a`
9. **G3.3 provider reservation operations** — accepted and squash-merged in PR
   #13 as `d84dee0`
10. **AG-01 application boundaries** — accepted and squash-merged in PR #15 as
    `ba172f1`
11. **AG-02A session credential integrity** — accepted and squash-merged in PR
    #16 as `9c38792`
12. **G3.4 live assigned-provider stock workspace** — accepted and merged in PR
    #18 as `7b2eb78`
13. **G3.5 live assigned-provider reservation workspace** — accepted and merged
    in PR #20 as `6c68ee3`
14. **G3.6 live operations overview** — accepted and squash-merged in PR #23 as
    `63707b8`
15. **G3.7 reservation expiry worker** — accepted and squash-merged in PR #26
    as `b7bba10`
16. **G3.8 completed inventory transfer** — accepted and squash-merged in PR
    #29 as `5521ad5` after exact-head CI run `31357016150`
17. **G3.9 completed damaged-stock write-off** — accepted and squash-merged in
    PR #32 as `72fc92a` after exact-head CI run `31371305767`
18. **G3.10 physical batch expiry reconciliation** — accepted and squash-merged
    in PR #35 as `ad2d15b` after exact-head CI run `31393057704`
19. **G3.11 one-way manual batch quarantine** — accepted and squash-merged in
    PR #38 as `d364794` after exact-head CI run `31761072418`
20. **G3.12 live batch quarantine workspace** — accepted and squash-merged in
    PR #41 as `85fdf53` after exact-head CI run `31762213509`
21. **G3.13 live damaged-stock workspace** — accepted and squash-merged in PR
    #42 as `636eb86` after exact-head CI run `31763244493`
22. **G3.14 live reservation lifecycle actions** — accepted and squash-merged
    in PR #43 as `7feacbb` after exact-head CI run `31763879935`
23. **G3.15 live completed inventory transfer** — accepted and squash-merged in
    PR #44 as `bc26e2a` after exact-head CI run `31764479220`
24. **G3.16–G3.20 inventory operations and evidence** — accepted through PR #50
25. **G3.21 transactional event delivery foundation** — implementation
    candidate; exact-head CI and CTO acceptance required
26. Resume producer wiring, Inventory, and Compliance milestones in dependency order

Only one recovery sprint may be active at a time. Exact boundaries may be refined through an ADR, but dependencies must not be skipped.

## Progress reporting rule

Progress is measured by accepted milestone criteria, not by the number of files
or endpoints present. The README's 40% full-roadmap estimate and 32% frontend
estimate are planning indicators, not acceptance or release claims. They may
change only when repository evidence and milestone acceptance change. Preview
screens, placeholder services, unmounted routes, and schema-only foundations do
not count as completed product modules.

## S0.1 validation evidence

| Check                          | Result                                                          |
| ------------------------------ | --------------------------------------------------------------- |
| Locked dependency installation | Passed with PNPM 9.15.0 after registry retries                  |
| `pnpm format:check`            | Passed                                                          |
| `pnpm lint`                    | Passed — 15/15 tasks                                            |
| `pnpm test`                    | Passed — 17/17 Turbo tasks                                      |
| `pnpm build`                   | Passed — 15/15 tasks with 0 cached                              |
| Markdown links                 | Passed — all repository-local links resolve                     |
| Workflow syntax                | Passed — quality and deployment-freeze YAML parsed successfully |

PR #1 was accepted and squash-merged as `d8958c4c1573b181e1f23874386b86ee837dd305`.

## S0.2 verification evidence

| Check                                          | Result                                                                                                                         |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Schema audit                                   | 18 models and 13 enums declared; the original migration contains 7 models and 4 enums                                          |
| Prisma schema validation and client generation | Passed                                                                                                                         |
| Additive schema diff                           | Tracked migration body exactly matches Prisma's generated diff from original auth state to declared schema                     |
| Clean PNPM locked installation                 | Passed in GitHub Actions ([workflow run 29732542356](https://github.com/pmdzayan/medsphere-services/actions/runs/29732542356)) |
| Clean PostgreSQL 16 migration deploy           | Passed                                                                                                                         |
| `prisma migrate status`                        | Passed — no unapplied migrations reported                                                                                      |
| Live-database-to-schema drift verification     | Passed — no drift detected                                                                                                     |
| Formatting                                     | Passed                                                                                                                         |
| Lint                                           | Passed                                                                                                                         |
| Tests                                          | Passed                                                                                                                         |
| Build                                          | Passed                                                                                                                         |
| PostgreSQL container cleanup                   | Passed                                                                                                                         |

The initial implementation commit `ed03abee671d075967499bfca742afbd61eb02d4`, the documentation evidence commit `c880d3d4e759ba369023dd319c5213885e06af4b`, and the final squash-merge commit `4480642b76dff0027c9ac63c598daa7cde8d53c3` all passed every gate. Reference: [PR #2](https://github.com/pmdzayan/medsphere-services/pull/2), workflow runs [29732542356](https://github.com/pmdzayan/medsphere-services/actions/runs/29732542356), [29736345081](https://github.com/pmdzayan/medsphere-services/actions/runs/29736345081), and [29736842625](https://github.com/pmdzayan/medsphere-services/actions/runs/29736842625).

PR #2 was accepted and squash-merged into `feature/database-architecture`.

## S0.3 verification evidence

| Check                                      | Result                                                                                                       |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| Locked dependency installation             | Passed in GitHub Actions                                                                                     |
| Clean PostgreSQL 16 migration deploy       | Passed                                                                                                       |
| `prisma migrate status`                    | Passed — no unapplied migrations reported                                                                    |
| Live-database-to-schema drift verification | Passed — no drift detected                                                                                   |
| Formatting                                 | Passed                                                                                                       |
| Lint                                       | Passed                                                                                                       |
| Real PostgreSQL auth/session tests         | Passed ([workflow run 29746017664](https://github.com/pmdzayan/medsphere-services/actions/runs/29746017664)) |
| Real Redis rate-limit tests                | Passed                                                                                                       |
| Explicit infrastructure-test execution     | Passed                                                                                                       |
| HTTP security-boundary tests               | Passed                                                                                                       |
| Build                                      | Passed                                                                                                       |
| PostgreSQL container cleanup               | Passed                                                                                                       |

Reference: [PR #3](https://github.com/pmdzayan/medsphere-services/pull/3) (squash-merge `7872e57982f0ba2f0681ece9fc445fa63ed320c4`), [PR #4](https://github.com/pmdzayan/medsphere-services/pull/4) (integration gate, merge `edc74d6eddee303b87f1ed09b4c2178d6fb3ee0e`), workflow runs [29746017664](https://github.com/pmdzayan/medsphere-services/actions/runs/29746017664) and [29747026515](https://github.com/pmdzayan/medsphere-services/actions/runs/29747026515).

PR #3 was accepted and squash-merged into `feature/database-architecture`.

## S0.4 verification evidence

S0.4 is implemented on `cto/s0.4-tenant-safe-rbac-durable-audit` in commits
`9603f5b`, `a8b2128`, `993324b`, `067ce63`, and `4f10eef`. The implementation
and strengthened verification gates have been published, reviewed, and proven
by the pull-request workflow.

| Check                                 | Result                                                                  |
| ------------------------------------- | ----------------------------------------------------------------------- |
| Locked dependency installation        | Passed with PNPM 9.15.0                                                 |
| Prisma schema validation              | Passed                                                                  |
| Prisma client generation              | Passed                                                                  |
| Static Prisma schema comparison       | Passed for modeled objects; not a live migration/trigger result         |
| Formatting                            | Passed                                                                  |
| Lint                                  | Passed locally — 15/15 Turbo tasks                                      |
| Tests                                 | Passed locally — 17/17 Turbo tasks; infrastructure suites skipped       |
| Auth strict test type-check and Jest  | Passed after final review — 104 passed, 16 infrastructure tests skipped |
| Build                                 | Passed locally — 15/15 Turbo tasks                                      |
| PostgreSQL 16 and Redis 7 integration | Passed in initial PR #7 workflow — 120/120 auth tests, zero skipped     |
| Clean deploy, status, and drift       | Passed in initial PR #7 workflow                                        |
| Populated S0.3 upgrade verification   | Passed all six isolated scenarios in strengthened PR #7 workflow        |
| Pull-request workflow                 | Strengthened run passed on exact commit `4f10eef`                       |
| Final documentation workflow          | Passed on exact commit `f2cd0df` in run `30132631443`                   |
| Merge                                 | PR #7 squash-merged as `4ea55a1`                                        |

The initial [PR #7 workflow run](https://github.com/pmdzayan/medsphere-services/actions/runs/30130479231)
proved the clean four-migration deployment, no drift, PostgreSQL and Redis
integration, 20/20 auth suites with 120/120 tests and zero skips, 15/15 lint
tasks, 17/17 test tasks, and 15/15 build tasks on commit `067ce63`.

Final contract review found that a clean migration chain did not prove a
populated S0.3 upgrade. The strengthened
[workflow run 30131410814](https://github.com/pmdzayan/medsphere-services/actions/runs/30131410814)
closed that gap on commit `4f10eef`: valid legacy membership-role and
role-permission data survived; legacy audit rows, unknown permissions, invalid
built-in roles, cross-tenant role-permission mappings, and ambiguous role
assignments each failed closed in isolated databases. The same run reported no
schema drift, 20/20 auth suites with 120/120 tests and zero skips, 15/15 lint
tasks, 17/17 test tasks, and 15/15 build tasks.

## S0.4 CTO acceptance decision

S0.4 satisfies ADR-004 and its sprint completion criteria. Architecture,
database integrity, tenant isolation, authorization failure behavior, audit
atomicity and immutability, concurrency, migration safety, validation,
duplication, security, and documentation have no unresolved acceptance
findings.

The final documentation-only commit passed
[workflow run 30132631443](https://github.com/pmdzayan/medsphere-services/actions/runs/30132631443).
PR #7 was squash-merged into `feature/database-architecture` as
`4ea55a17e188410ddee45fa3ea6c016e22d6617a`.

S0.4 is accepted and closed. S0.5 may proceed under ADR-005 and its sprint
contract. This is not production or legal-compliance approval.

## ADR-006 runtime and security verification evidence

ADR-006 is implemented on `cto/s0.5-integrity-remediation` at commit
`a409f052f00224130da796db951d6afdbcaa0726`.

| Check                                     | Result                                  |
| ----------------------------------------- | --------------------------------------- |
| Locked PNPM 9.15.0 installation           | Passed                                  |
| Production dependency audit               | Passed — zero known vulnerabilities     |
| Clean PostgreSQL 16 migration and drift   | Passed                                  |
| Populated S0.3 to S0.4 upgrade safety     | Passed                                  |
| Formatting                                | Passed                                  |
| Lint                                      | Passed — 15/15 Turbo tasks              |
| PostgreSQL and Redis infrastructure tests | Passed without local-only substitutions |
| Tests                                     | Passed — 17/17 Turbo tasks              |
| Build                                     | Passed — 15/15 Turbo tasks              |
| Exact-commit pull-request workflow        | Passed                                  |

Evidence: [PR #9](https://github.com/pmdzayan/medsphere-services/pull/9) and
[workflow run 30147083613](https://github.com/pmdzayan/medsphere-services/actions/runs/30147083613).

ADR-006 implementation and verification are CTO-accepted. S0.5 stock and
reservation implementation remains blocked until PR #9 is squash-merged into
`feature/database-architecture`.
