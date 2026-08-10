# MedSphere

MedSphere is a planned multi-tenant healthcare ecosystem for patients, pharmacies, suppliers, hospitals, doctors, laboratories, and administrators.

> **Current status: stabilization prototype.** This repository is not approved for production deployment or for real patient, prescription, identity, or medicine-inventory data. See [PROJECT_STATUS.md](PROJECT_STATUS.md) before making changes.

## Verified project progress

**Status date:** 2026-08-10

**Accepted evidence baseline:** `5521ad5` (PR #29 squash merge)

**Current sprint:** G3.8 accepted; next bounded sprint not selected

**Full-roadmap estimate:** **33% complete / 67% remaining**

This is an engineering progress estimate against the complete MedSphere roadmap,
including stabilization, healthcare-domain workflows, frontend applications,
production operations, and planned Gates 10–20. It is not a release-readiness,
regulatory-compliance, or legal-approval percentage. Placeholder services, Prisma
models without accepted workflows, preview data, and unmounted routes do not count
as completed modules.

The estimate is weighted by roadmap scope rather than averaged from the table
below. Most of the product value sits in healthcare workflows that have not yet
been built, so a strong foundation does not make the overall platform nearly
finished.

The evidence-based [Gates 1–20 verification](docs/audits/2026-08-01-gates-1-20-verification.md)
rejects the claim that the full roadmap is complete: Gate 1 is an accepted
foundation, Gate 3 has accepted backend foundations but is not complete/live,
and Gates 2 and 4–20 are not complete.

| Area                                                             | Verified state                                                                                                                                                                  | Estimated completion |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------: |
| Architecture, governance, monorepo, and database baseline        | ADR process, PNPM/Turbo tooling, shared packages, forward migrations, drift checks, and CI gates exist                                                                          |                  85% |
| Authentication, tenant context, RBAC, and durable audit          | S0.3 and S0.4 accepted; authenticated frontend, role administration, effective permissions, audit, policy-controlled onboarding, and personal privacy settings implemented      |                  85% |
| Inventory ledger and medicine reservation integrity              | S0.5 and G3.1–G3.3 reads/commands are accepted; live frontend integration and broader operations remain incomplete                                                              |                  75% |
| Frontend                                                         | Landing, login, shell, team/RBAC, audit, assigned-provider stock, and reservation reads are connected; pharmacy dashboard and most healthcare modules remain previews or absent |                  38% |
| Compliance beyond RBAC and audit                                 | Consent, privacy operations, verification, retention, legal hold, and policy enforcement remain incomplete                                                                      |                  10% |
| Supplier, procurement, pharmacy, billing, and delivery workflows | Existing deployables are mostly health-only placeholders or unaccepted prototypes                                                                                               |                   5% |
| Hospital, doctor, laboratory, patient, and clinical journeys     | Some schema foundations exist, but accepted end-to-end application workflows are not implemented                                                                                |                   2% |
| Production operations and release readiness                      | Pull-request quality gates and a deployment freeze exist; deployment, observability, backup/restore, disaster recovery, performance evidence, and operational acceptance remain |                  10% |
| Gates 10–20 and AI/network expansion                             | Planned but not implemented as accepted product capabilities                                                                                                                    |                   0% |

### Substantially completed and verified foundations

- S0.1 architecture and repository governance.
- S0.2 reproducible PostgreSQL migration baseline.
- S0.3 authentication, trusted tenant context, refresh rotation, replay
  protection, and rate limiting.
- S0.4 tenant-safe authorization and append-only durable audit.
- S0.5 inventory-ledger and medicine-reservation integrity accepted through
  PR #10, including its migration and domain tests. Operational HTTP exposure
  remains a sequence of separately reviewed sprints.
- Premium frontend foundation: public landing page, login, authenticated and
  responsive application shell, and pharmacy operations visual language.
- Connected frontend administration: team membership, role lifecycle, role
  assignment, effective-permission behavior, and tenant audit evidence.
- Frontend Tasks 11–12 add personal privacy settings and policy-controlled
  onboarding without claiming that the wider compliance milestone is complete.
- PR #10 passed its final quality workflow at commit `3003625` in
  [run 30741672770](https://github.com/pmdzayan/medsphere-services/actions/runs/30741672770)
  and was squash-merged as `410368c`.
- G3.1 passed run `30743115664` and was squash-merged in PR #11 as `77689b5`,
  accepting migration-backed provider assignments and the first
  permission-protected stock read contract.
- G3.2 listing configuration, batch receipt, and stock adjustment commands were
  accepted and squash-merged in PR #12 as `3249f8a`.
- G3.3 provider reservation reads and transitions were accepted and
  squash-merged in PR #13 as `d84dee0`.
- AG-01 application boundaries and corrected AG-02A session credential
  integrity were accepted in PRs #15 and #16 as `ba172f1` and `9c38792`.
- G3.4 replaced fabricated inventory rows with strict same-origin
  assigned-provider and stock reads, exact response validation, and live
  read-only workspace states; PR #18 merged as `7b2eb78` after run
  `31278555022` passed.
- G3.6 replaced fabricated dashboard claims with bounded read-only composition
  of accepted stock and reservation reads; PR #23 merged as `63707b8` after run
  `31305222063` passed.

### Remaining work

1. **Expose remaining bounded inventory mutations:** define separate transfer,
   return, damage, expiry, and reservation contracts with atomic audit; connect
   frontend previews only after each backend contract is accepted.
2. **Complete inventory operations:** expiry management, transfers, damaged
   stock, returns, recalls/quarantine, operational analytics, and production
   worker behavior where accepted by dedicated sprints.
3. **Complete reservation operations:** staff reservation creation, lifecycle,
   expiry processing, fulfilment UI, and later patient-safe exposure. Delivery
   and payment must remain separate bounded sprints.
4. **Finish the compliance foundation:** consent management, provider
   verification, privacy center, retention, legal hold, and policy engine.
5. **Build supplier and procurement:** supplier profiles, verification,
   purchase orders, approval, goods receipt, batch capture, and procurement
   dashboards.
6. **Build complete pharmacy workflows:** catalog operations, dispensing,
   sales, invoices, reports, staff operations, and analytics.
7. **Build hospital, doctor, laboratory, and patient journeys:** departments,
   beds, schedules, appointments, encounters, SOAP notes, prescriptions,
   orders, samples, reports, consent-aware records, and role-specific
   dashboards.
8. **Build platform services:** billing and insurance, notifications,
   documents and signatures, workflow approvals, reporting, exports, feature
   flags, settings, and analytics. The current billing and notification apps
   are health-only scaffolds, not finished services.
9. **Finish cross-cutting frontend quality:** live API integration for every
   accepted module, accessibility verification, dark mode, PWA/offline rules,
   responsive device testing, and browser end-to-end coverage.
10. **Implement planned Gates 10–20:** universal inventory migration, medicine
    marketplace, hospital discovery, live healthcare availability,
    appointments and queues, laboratory information system, radiology/PACS,
    governed clinical decision support, patient mobile app, analytics, and the
    national healthcare network.
11. **Earn production release approval:** secure deployment environments,
    secrets management, observability, alerting, backups, restore tests,
    disaster recovery, performance/load testing, penetration testing,
    operational runbooks, and compliance-control review.

The percentage must be revised only when repository evidence and milestone
acceptance change. Adding files, models, disabled navigation, or preview screens
does not by itself increase completion.

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
pnpm db:verify-upgrade
```

`db:verify` validates the Prisma schema, deploys every migration, checks migration status, and fails if the deployed database drifts from the declared schema. Never use `prisma db push` on a shared database.

`db:verify-upgrade` is an infrastructure-only S0.4 gate. It creates isolated
temporary PostgreSQL databases, proves conversion of a populated valid S0.3
authorization state, proves that five unsafe legacy-data categories fail
closed, and removes every temporary database. Never run it against a database
account that cannot safely create and remove isolated test databases.

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
