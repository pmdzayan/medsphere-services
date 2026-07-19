# MedSphere Project Rules

**Version:** 1.0

**Authority:** CTO engineering policy

**Applies to:** Humans, AI agents, automation, and pull requests

## 1. Order of work

MedSphere follows this lifecycle without skipping steps:

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

One Cline task equals one focused sprint. Every prompt must be complete and include:

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

- **ChatGPT / CTO:** architecture, roadmap, ADRs, task design, review, and documentation approval
- **Cline:** backend implementation from an approved sprint specification
- **Claude:** frontend implementation from an approved frontend specification
- **Roo Code / Continue:** bounded refactoring and bug fixes after review
- **Windsurf:** testing, QA, regression evidence, and acceptance verification

No agent may self-approve a major architecture change or mark a milestone complete without CTO review.

## 11. Git and review

- One sprint branch and one focused pull request.
- Use conventional, descriptive commits.
- Never commit secrets, real patient data, credentials, generated dependency folders, or local environment files.
- Do not bypass required checks.
- Do not combine unrelated modules.
- Record major decisions in ADRs and update status, handoff, roadmap, and the relevant Development Bible volume in the same sprint.
