# AIM — All In Medico Project Rules

**Version:** 1.0

**Authority:** CTO engineering policy

**Applies to:** Humans, AI agents, automation, and pull requests

## 1. Order of work

AIM follows this lifecycle without skipping steps:

1. Design
2. Review
3. Implement
4. Test
5. Review
6. Document

Roadmap dependencies are mandatory. If the current sprint or milestone has not met its completion criteria, the next one must not start.

## 2. Source-of-truth hierarchy

1. Accepted Architecture Decision Records
2. `PROJECT_STATUS.md`
3. `PRODUCT_ROADMAP.md`
4. Development Bible
5. Module specifications and historical assessments

Code is evidence of what exists, not proof that a feature is accepted. A feature is complete only when its documented acceptance, test, security, migration, and review gates pass.

## 3. Architecture principles

- Version 1 uses a modular monolith as defined by ADR-001.
- Organize code by bounded healthcare domain, not by accidental technical ownership.
- Every module owns its business rules and persistence boundary.
- Cross-module access must use explicit application contracts or domain events.
- Do not query or mutate another module's tables from outside its owned persistence layer.
- Preserve extraction seams; do not introduce distributed deployment without an accepted ADR.
- Prefer Clean Architecture, SOLID, DRY, type safety, reusable components, and domain-driven modeling.
- Do not hard-code business policy, user identity, tenant identity, organization identity, permissions, status transitions, dates, or regulatory rules.
- Remove duplicate or dead code only after behavior is covered by tests and consumers are identified.

## 4. Healthcare safety baseline

- Deny access by default.
- Derive user and tenant context from a verified authentication and membership chain.
- Never trust identity, tenant, organization, role, permission, or ownership supplied only by the client.
- Enforce authorization in the application and integrity constraints in the database.
- Treat patient data, medical records, prescriptions, identity documents, and audit data as sensitive.
- Do not log secrets, tokens, passwords, unredacted medical data, or unnecessary personal data.
- Security-sensitive and clinical-impacting actions require attributable audit events.
- Consent, purpose, retention, deletion, and legal-hold behavior must be explicit and testable.
- Controlled-medicine workflows are outside the current roadmap gate and must not be added early.
- Do not claim legal or regulatory compliance without a documented control mapping and qualified review.

## 5. Database rules

Every persisted feature must define and review:

- Entity ownership and tenant scope
- Columns, types, nullability, defaults, and enums
- Primary, foreign, and unique keys
- Relationships and deletion behavior
- Check constraints and business invariants
- Query-driven indexes
- Audit fields and immutable records where required
- Migration, rollback/forward-fix, and clean-database verification
- Concurrency and transaction boundaries
- Data retention, archival, and deletion consequences

The Prisma schema and migration history must agree. A feature that cannot be recreated from migrations is not complete.

## 6. API rules

- Validate every external boundary with typed DTOs.
- Enable whitelist behavior and reject unexpected fields where appropriate.
- Use a consistent error envelope without stack traces or sensitive details.
- Version public APIs before external consumers depend on them.
- Document accepted endpoints and schemas in OpenAPI/Swagger.
- Apply authentication, permission, tenant, rate-limit, and audit requirements explicitly.
- Paginate bounded collections and allow-list filters and sorting fields.
- Use idempotency and optimistic/pessimistic concurrency where workflow risk requires them.

## 7. Testing rules

Tests must be proportional to risk and include, where applicable:

- Unit tests for domain rules and state transitions
- Repository integration tests against the real database engine
- API tests for validation and error contracts
- Authentication and authorization negative tests
- Cross-tenant isolation tests
- Transaction rollback and concurrency tests
- Audit-event tests
- Migration tests from an empty database and supported upgrade paths
- Security, performance, load, and E2E tests at their roadmap gates

Mocks must not hide transaction-client usage, database constraints, authorization scope, or event delivery behavior.

## 8. Mandatory quality gate

Every implementation task ends with this exact sequence:

```bash
pnpm lint
pnpm test
pnpm build
```

Fix issues and repeat until all commands pass. A skipped or blocked command must be reported as blocked; it must never be reported as passing.

Before completion, review for duplicate code, bad boundaries, missing validation, performance problems, security problems, tenant leakage, missing audit behavior, and documentation drift.

## 9. Cline task standard

One Cline prompt must have one coherent sprint objective. A prompt may contain multiple small work items when all items:

- belong to the same sprint;
- affect the same module, layer, or governance outcome;
- share dependencies or validation;
- can be reviewed together safely;
- do not bypass roadmap dependencies.

There is no fixed numeric limit for related small work items. Do not combine unrelated modules merely to make a larger prompt.

Every prompt must be complete and include:

1. Objective
2. Repository analysis
3. Functional and non-functional requirements
4. Constraints and explicit out-of-scope items
5. Database entities, relationships, constraints, indexes, and migrations
6. Services, repositories, controllers, DTOs, validation, permissions, and Swagger
7. Logging, audit, privacy, and future extensibility
8. Coding standards
9. Tests and validation commands
10. Deliverables and completion report

Cline must first read the repository, `AI_HANDOFF.md`, `PROJECT_STATUS.md`, relevant ADRs, and existing tests. It must identify reusable services, DTOs, utilities, guards, repositories, and patterns before editing. It must not duplicate code.

If VS Code tools can safely navigate, refactor, fix warnings, rename symbols, or improve code, Cline should use them instead of risky manual edits.

The completion report must list files modified, database changes, API endpoints, tests executed, lint status, build status, remaining work, and suggestions.

## 10. Agent responsibilities

- **ChatGPT / Codex (CTO):** product and system architecture; roadmap and dependency control; Architecture Decision Records; database strategy; security and healthcare compliance; large, high-risk, or cross-module backend implementations; sprint design; final code and architecture review; documentation acceptance; milestone acceptance
- **Claude (frontend engineer):** frontend architecture; frontend implementation; components, pages, workflows, state management, and API integration; responsive behavior; accessibility; frontend testing. Must use approved backend contracts and frontend specifications. Must not independently change backend architecture or API contracts
- **Cline (small-task implementation engineer):** small, bounded backend changes; configuration improvements; documentation maintenance; small bug fixes; bounded refactoring; supporting unit or integration tests; repository maintenance tasks. Must not make major architecture, database-strategy, security-policy, compliance-policy, or cross-module decisions without CTO approval. Must not implement frontend work assigned to Claude

Implementation testing is the responsibility of the implementing agent. Final acceptance is the responsibility of the CTO.

No agent may self-approve a major architecture change or mark a milestone complete without CTO review.

## 11. Git and review

- One sprint branch and one focused pull request.
- Use conventional, descriptive commits.
- Never commit secrets, real patient data, credentials, generated dependency folders, or local environment files.
- Do not bypass required checks.
- Do not combine unrelated modules.
- Record major decisions in ADRs and update status, handoff, roadmap, and the relevant Development Bible volume in the same sprint.

## 12. Scaling complexity governance

AIM follows ADR-030's **measure-before-complexity** rule.

- Do not add or activate a production broker, new datastore/search cluster, database sharding/read-replica layer, service mesh, autoscaling controller, or new independently deployed service boundary merely because it is a common scale pattern.
- First reproduce and measure the bottleneck against the accepted runtime baseline.
- Prefer the smallest safe change that addresses the measured constraint.
- A production scaling primitive requires an Accepted ADR, measured bottleneck evidence, baseline, expected improvement, operational ownership, healthcare security/privacy consequences, rollout, and rollback.
- Do not weaken latency/error thresholds merely to obtain a green build. Changes to the performance baseline require documented evidence and CTO review.
- Prototype services and prototype infrastructure remain non-authoritative until separately accepted; repository presence is not production approval.
- Every task that changes production scaling architecture must pass `pnpm test:architecture-governance` in addition to the normal quality gate.

The executable policy is `docs/architecture/bottleneck-governance.json`.

## 13. Network and low-bandwidth governance

AIM follows ADR-031's privacy-safe network-efficiency boundary.

- Keep browser-facing production compression enabled unless an accepted replacement provides equivalent or better measured transfer behavior.
- Only versioned/static public assets may use shared/service-worker caching by default. Healthcare/API responses, navigations, authenticated pages, patient data, inventory state, reservations, billing, authorization and audit data remain outside shared caches.
- Keep service-worker code revalidated so privacy/security policy updates are discoverable.
- Public-route transfer, request-count and constrained-network readiness budgets are release gates. Do not raise a budget merely to obtain a green build; identify the regression and record evidence for any reviewed threshold change.
- Prefer bounded responses, pagination, request cancellation/deduplication, compression and existing static caching before adding new network infrastructure.
- Selected public routes must not introduce a third-party browser dependency without explicit privacy, security, availability and bandwidth review.
- Every task that changes browser caching, compression, PWA network behavior or public-route bundle/request shape must pass `pnpm test:network-efficiency-boundary` and the applicable real-browser network certification.

The executable budget is `docs/architecture/network-efficiency-budget.json`.

## 14. AI-code security and data-integrity governance

AIM follows ADR-032's independent high-risk change rule.

- AI-assisted code is untrusted until it passes normal AIM tests and Task 0060.
- Changes to auth-service production code, web BFF/API routes, shared security code, Prisma schema/migrations, or Task 0060 enforcement require independent approval from a reviewer other than the PR author.
- Bot/self approvals do not count; the reviewer's latest submitted state must be `APPROVED`.
- Never accept client-supplied tenant, organization, provider, membership, role, or authorization context as authority.
- Never bypass tenant-qualified authorization, transactions/locking/idempotency, audit, or populated-upgrade safety to satisfy a generated implementation.
- Configured hard-fail secret, unsafe raw-SQL, runtime-execution, TLS, and destructive-migration findings cannot be waived by ordinary PR approval.
- Destructive migration exceptions must be exact-path, exact-rule, expiring, backed by an existing Accepted ADR, and independently reviewed.
- Do not weaken the Task 0060 policy, scanner, workflow, or tests merely to make CI green.
- High-risk changes must pass `pnpm test:ai-code-security-gate` and the dedicated `AIM Independent AI-Code Security & Data-Integrity Gate` workflow.

The executable policy is `docs/architecture/ai-code-security-data-integrity-policy.json`.

## 15. Blue/green release environment governance

AIM follows ADR-033 and UM14.1's **roles-not-colors, single-write-authority** rule.

- BLUE and GREEN are reusable physical environment identities, not permanent production/test roles.
- Exactly one environment is `ACTIVE` at a time.
- Only `ACTIVE` may own production database write authority; dual-write or split-brain blue/green operation is forbidden unless a later Accepted ADR replaces this rule with proven conflict semantics.
- The inactive environment is either `ROLLBACK` or `CANDIDATE`.
- A `CANDIDATE` must be freshly synchronized from the current `ACTIVE` release and carry bounded synchronization evidence before promotion.
- A `ROLLBACK` environment may not become `ACTIVE` directly. It must first become a synchronized `CANDIDATE`.
- Promotion must atomically move the role and write authority, while the former `ACTIVE` becomes `ROLLBACK`.
- Role manifests contain opaque identifiers/evidence only; never database URLs, credentials, tokens, PHI, customer data, or raw security findings.
- Database synchronization, schema compatibility, traffic shifting, canary percentages and automatic rollback require their later Milestone 14 controls; UM14.1 alone does not authorize them.
- Changes to this contract must pass `pnpm test:blue-green-role-model` and the normal quality gate.

The executable policy is `docs/architecture/blue-green-environment-role-policy.json`.

## 16. Blue/green candidate synchronization governance

AIM follows ADR-034 and UM14.2's **snapshot-rebuild-inactive-only** rule.

- Candidate synchronization may rebuild only the inactive environment while it is in the `ROLLBACK` role.
- The synchronization source must be the current `ACTIVE` database and must exactly match the operator-provided production database reference.
- The source and candidate database endpoints must differ; the ACTIVE database may never be the destructive rebuild target.
- Rebuilding the inactive database requires an exact confirmation bound to its physical environment and opaque database identity.
- Production snapshots must be stored outside the repository on encrypted, access-controlled storage. Never commit a snapshot, database URL, credential, PHI, patient record, pharmacy customer record, or raw backup content.
- Application write authority remains exclusively on `ACTIVE` during synchronization. UM14.2 does not authorize dual writes or application writes to `CANDIDATE`.
- A restored candidate must pass the accepted Task 0022 integrity verifier before synchronization evidence may be emitted.
- Synchronization evidence must be bounded and secret-free, bind the snapshot SHA-256, and identify source/candidate only through approved environment/database/release identities.
- A failed candidate and failed snapshot are removed by default; diagnostic retention requires explicit operator action and controlled cleanup.
- Snapshot synchronization is point-in-time, not continuous replication. Later rollout work must prevent post-snapshot ACTIVE writes from being lost before promotion.
- Changes to this contract must pass `pnpm test:blue-green-candidate-sync`, `pnpm test:architecture-governance` when applicable, Task 0060 independent review, and the normal quality gate.

The executable policy is `docs/architecture/blue-green-candidate-sync-policy.json`.
