# MedSphere

MedSphere is a planned multi-tenant healthcare ecosystem for patients, pharmacies, suppliers, hospitals, doctors, laboratories, and administrators.

> **Current status: stabilization prototype.** This repository is not approved for production deployment or for real patient, prescription, identity, or medicine-inventory data. See [PROJECT_STATUS.md](PROJECT_STATUS.md) before making changes.

## Version 1 architecture

MedSphere Version 1 is being consolidated into a **modular monolith** with explicit bounded modules and future service-extraction seams. The current repository still contains multiple service applications that share one database; they are migration inputs, not the approved target architecture.

The architecture, database-baseline, and authentication decisions are recorded in [ADR-001](docs/adr/0001-modular-monolith-for-version-1.md), [ADR-002](docs/adr/0002-append-only-reproducible-database-baseline.md), and [ADR-003](docs/adr/0003-trusted-authentication-and-tenant-context.md).

## Required reading

Every developer and AI agent must read these documents in order:

1. [PROJECT_RULES.md](PROJECT_RULES.md)
2. [PROJECT_STATUS.md](PROJECT_STATUS.md)
3. [AI_HANDOFF.md](AI_HANDOFF.md)
4. [PRODUCT_ROADMAP.md](PRODUCT_ROADMAP.md)
5. [MedSphere Development Bible](docs/development-bible/README.md)
6. [Architecture Decision Records](docs/adr/README.md)

If documentation conflicts, `PROJECT_STATUS.md` and accepted ADRs describe the current implementation authority. Product milestones remain ordered by `PRODUCT_ROADMAP.md`.

## Repository layout

```text
apps/                       Existing NestJS deployable applications
packages/                   Shared TypeScript packages and Prisma schema
docs/adr/                   Architecture Decision Records
docs/audits/                Evidence-based engineering audits
docs/development-bible/     Living engineering handbook
compose/                    Local orchestration
```

The layout above reflects the repository today. It will change incrementally as the modular-monolith migration is designed, tested, and approved.

## Local quality checks

Requirements:

- Node.js 20.11 or newer
- PNPM 9.15.0
- A local `.env` created from `.env.example`; never commit real secrets

Start the local PostgreSQL 16 database and verify the full migration chain:

```bash
docker compose --env-file .env -f compose/docker-compose.database.yml up -d
pnpm db:verify
```

`db:verify` validates the Prisma schema, deploys every migration, checks migration status, and fails if the deployed database drifts from the declared schema. Never use `prisma db push` on a shared database.

Run the same mandatory gates used in pull requests:

```bash
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm test
pnpm build
```

No sprint is complete unless every applicable command passes and the implementation has been reviewed for duplication, architecture, validation, performance, security, tenant isolation, audit behavior, and test quality.

## Contribution rule

Do not commit directly to the protected default branch. Use one sprint branch, one focused pull request, and the checklist in the pull-request template. Production delivery remains intentionally disabled until the production-release milestone is accepted.
