# AIM — All In Medico

AIM — All In Medico, formerly developed under the MedSphere working name, is a multi-tenant healthcare visibility and medicine-operations platform being developed for patients, pharmacies, hospitals, suppliers, and authorized healthcare staff.

> **Release state: NOT approved for production or real healthcare data.** Development, testing, and demonstrations must use synthetic data only. Repository progress, successful CI, or completed features do not by themselves establish regulatory compliance or production approval.

## V1 objective

Version 1 focuses on a safe, testable path from medicine inventory to availability, reservation, and pharmacy operations while maintaining strict tenant, authorization, privacy, and audit boundaries.

The supported V1 runtime is currently:

- `apps/auth-service` — supported backend runtime
- `apps/web` — supported frontend runtime
- PostgreSQL 16 — authoritative relational data store
- Redis 7 — supported runtime infrastructure

Other application scaffolds in the monorepo are not automatically accepted V1 product capabilities.

## Current engineering status

**Status date:** 2026-09-08

**Authoritative branch:** `feature/database-architecture`

**Current authoritative HEAD:** `0aa5dc1f0cfba618467dd957ea1afdf386aa7c71`

**Current authoritative tree:** `d7fe5420705ac9da47e8d189340e5d5624800e97`

No current whole-roadmap completion percentage is asserted. AIM still has
substantial healthcare-domain, shared-platform, production-certification, and
India-launch work remaining; `PRODUCT_ROADMAP.md` remains the roadmap authority.

### Recently accepted foundation work

- Task 0022 — Production Backup, Restore & Recovery Operations Foundation:
  accepted and merged in PR #141 from source
  `dc1402f02fec075ff3cd3f0643a53583a5feea2b`, with merge commit
  `6bd5aee560f72aac6482384b320a7bb0e14d6657`. Its accepted scope is the
  repository-owned logical PostgreSQL backup/restore/recovery operations
  foundation. It does not activate provider snapshots, PITR, production backup
  storage, or production recovery operations. ADR-0027 remains Proposed unless
  separately accepted.
- Task 0023 — Production Runtime, Secrets & Deployment Safety Foundation:
  accepted and merged in PR #142 from source
  `efeee75c8b37e5c5eab3c7bc29aff2d8a09308e9`, producing the current
  authoritative merge SHA
  `0aa5dc1f0cfba618467dd957ea1afdf386aa7c71` and tree
  `d7fe5420705ac9da47e8d189340e5d5624800e97`. Production-runtime
  certification run `34135844389` completed successfully, and ADR-0028 is
  Accepted.
- Task 0023 establishes repository-owned fail-closed runtime configuration,
  secret-isolation, component capability classification, and deployment-safety
  foundations. `auth-service` is the accepted production-capable backend
  runtime; prototype-blocked and health-only scaffold classifications remain
  enforced.

These accepted foundations do **not** mean AIM has been deployed to production.
Real production infrastructure, real secrets, DNS/TLS, production
PostgreSQL/Redis, external-provider activation, provider-specific backup/PITR,
real healthcare data, and final production-release approval remain outside the
accepted state.

## Product definition and engineering authority

AIM is not developed from a single AI prompt. Product and implementation decisions are governed through repository evidence and explicit documents covering:

1. product vision, users, problems, and V1 scope;
2. architecture and bounded-module responsibilities;
3. database and migration rules;
4. authentication, authorization, tenant isolation, and audit;
5. privacy and data-minimization boundaries;
6. testing, failure handling, recovery, and release gates;
7. DevOps, runtime configuration, and operational readiness;
8. ADRs and sprint-specific acceptance evidence.

Every developer and AI implementation agent must follow the repository's accepted requirements and may not independently redefine completion criteria.

## Security and privacy

Security and privacy are first-class V1 architecture requirements, not post-launch additions.

### Implemented and tested security foundations

- trusted authentication and tenant context;
- RBAC and permission enforcement;
- provider-access authorization;
- immediate authority revocation through authoritative authorization reads;
- cross-tenant access rejection;
- alternate-route authorization coverage;
- last-tenant-administrator protection, including concurrency evidence;
- append-only durable audit evidence for privileged operations;
- actor, tenant, resource, and correlation attribution in audit records;
- transactional rollback when required audit persistence fails;
- reservation and inventory concurrency/idempotency protections;
- dependency, formatting, lint, TypeScript, migration/drift, upgrade-safety, PostgreSQL/Redis, and build gates in CI.

### Implemented privacy boundaries

- public medicine search exposes only coarse, intentionally minimized availability information;
- public responses do not expose batch IDs, inventory IDs, purchase cost, staff/member IDs, contact payloads, or exact internal stock details;
- tenant-scoped healthcare operations reject unauthorized cross-tenant actors;
- notification architecture uses bounded recipient/routing references rather than copying unnecessary contact data through domain events;
- observability for notification delivery is designed around metadata rather than healthcare/contact payloads;
- real healthcare data remains prohibited until production and compliance acceptance explicitly authorize it.

### What we do NOT claim

The repository must not currently be described as production-certified, HIPAA-compliant, DPDP-compliant, ABDM-compliant, or otherwise legally/regulatorily certified merely because technical controls exist. Final compliance mapping, deployment controls, operational evidence, security testing, privacy review, and release acceptance remain separate launch gates.

## Reliability and failure handling

AIM uses evidence-driven failure handling rather than hiding failing tests or weakening safety checks.

Current foundations include:

- transactional mutation boundaries;
- rollback evidence for failed privileged operations;
- idempotency and same-key retry protection;
- bounded notification retries and dead-letter handling;
- PostgreSQL-backed concurrency tests for critical invariants;
- reproducible migration and populated-upgrade checks;
- exact-head CI before acceptance;
- a dedicated runtime/live-smoke verification path for the supported V1 stack.

A failing gate blocks acceptance. Tests must not be deleted, skipped, mocked away, or weakened merely to obtain a green build.

## Remaining V1 launch work

The remaining work is concentrated less on basic scaffolding and more on proving the integrated product can be operated safely. Major remaining areas include:

- complete Batch 2 Task 5 live runtime/smoke verification;
- close any defects discovered by end-to-end runtime testing;
- production environment and deployment hardening;
- secrets and configuration management;
- observability, alerting, and operational dashboards;
- backup, restore, and disaster-recovery evidence;
- performance/load and reliability testing;
- final security and privacy verification;
- browser/end-to-end user-journey acceptance;
- launch runbooks and operational ownership;
- final governance and release acceptance.

The working planning estimate is roughly **20–25 major tasks remaining**, subject to change when runtime verification exposes new evidence. No task count overrides the acceptance gates.

## Version 1 architecture

AIM V1 is being consolidated around a **modular-monolith** architecture with explicit bounded modules and future service-extraction seams. Existing additional service applications in the repository are migration inputs/prototypes unless separately accepted.

Core architectural decisions are recorded under [`docs/adr/`](docs/adr/) and the Development Bible under [`docs/development-bible/`](docs/development-bible/).

## Required reading

Every developer and AI agent must read these documents before making changes:

1. [PROJECT_RULES.md](PROJECT_RULES.md)
2. [PROJECT_STATUS.md](PROJECT_STATUS.md)
3. [AI_HANDOFF.md](AI_HANDOFF.md)
4. [PRODUCT_ROADMAP.md](PRODUCT_ROADMAP.md)
5. [AIM Development Bible](docs/development-bible/README.md)
6. [Architecture Decision Records](docs/adr/README.md)

Accepted ADRs, merged implementation evidence, exact-head CI, and sprint acceptance records are the engineering authority. If a summary document is stale, it must not override newer accepted repository evidence.

## Repository layout

```text
apps/                       Application runtimes and prototype services
packages/                   Shared TypeScript packages and Prisma schema
docs/adr/                   Architecture Decision Records
docs/audits/                Evidence-based engineering audits
docs/development-bible/     Living engineering handbook
docs/sprints/               Sprint and acceptance evidence
compose/                    Local orchestration
```

## Local development

For the complete clean-machine bootstrap path, see [the Local Development Bible](docs/development-bible/11-devops.md).

```bash
pnpm install --frozen-lockfile
cp .env.example .env
pnpm dev:keys
pnpm dev:infra
pnpm db:verify
pnpm dev:app
pnpm dev:check
```

`pnpm dev:app` runs the supported V1 backend and frontend. Do not treat every application under `apps/` as an accepted V1 service.

Never commit real secrets or real healthcare data.

## Local quality checks

Requirements:

- Node.js `^20.19.0` or `>=22.12.0`
- PNPM 9.15.0
- local `.env` created from `.env.example`
- PostgreSQL 16 and Redis 7 for applicable infrastructure-backed verification

Run the supported infrastructure and migration verification:

```bash
pnpm dev:infra
pnpm db:verify
pnpm db:verify-upgrade
```

Run mandatory repository quality gates:

```bash
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm test
pnpm build
```

Applicable PostgreSQL/Redis-backed integration suites and exact-head GitHub CI must also pass before a sprint requiring them can be accepted.

## Contribution and acceptance rule

Do not commit feature work directly to the protected default branch. Use one bounded task/sprint branch and one focused pull request.

A task is not complete merely because code exists. Applicable acceptance requires repository analysis, baseline evidence, implementation, targeted tests, infrastructure-backed tests where required, formatting/lint/type/build gates, exact-head CI, architecture/security/privacy review, merge, and governance evidence.

Production delivery and real healthcare data remain disabled until explicit production-release acceptance is completed.
