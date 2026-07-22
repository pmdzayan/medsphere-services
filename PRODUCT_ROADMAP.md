# MedSphere Product Roadmap

**Version:** 1.1

**Planning model:** Milestone → Sprint → Task → Checklist → Completion criteria

This roadmap preserves the MedSphere product vision while inserting the engineering stabilization dependency required by the 2026-07-20 CTO audit.

## Milestone 0 — Architecture and Safety Stabilization

**Status:** RC1 complete — awaiting CTO acceptance

**Purpose:** Make the existing foundation reproducible, secure, testable, and truthful before new features.

Ordered sprints:

1. S0.1 Architecture and repository governance — accepted
2. S0.2 Reproducible database baseline — accepted and merged
3. S0.3 Authentication and trusted tenant context — accepted
4. RC1 Platform Stabilization & Production Readiness — **complete**
5. S0.4 Tenant-safe RBAC and audit integration — blocked by RC1
6. S0.5 Inventory ledger and reservation integrity — blocked by S0.4

**Completion gate:** Accepted ADRs; protected review flow; clean migrations; deny-by-default authentication; tenant-isolation tests; integrated audit trail; atomic stock/reservation behavior; mandatory lint/test/build passing.

### RC1 completion summary

RC1 stabilization is complete. All quality gates pass:

- `pnpm install` — passed
- `pnpm prisma generate` — passed
- `pnpm prisma validate` — passed
- `pnpm lint` — passed (zero errors)
- `pnpm build` — passed (zero TypeScript errors)
- `pnpm test` — passed (all test suites)

14 bugs were found and fixed during RC1, including Prisma schema relation fixes, unused import/parameter cleanup, TypeScript configuration fixes, and test timeout resolution. See `PROJECT_STATUS.md` for the full bug list and `AI_HANDOFF.md` for the completion report.

## Milestone 1 — Foundation and Core Inventory

**Status:** Reopened after audit

**Scope:** Monorepo foundation, shared packages, medicine catalog foundation, batch management, stock ledger, FEFO, expiry alerts, transfers, damaged stock, returns, and inventory analytics.

**Completion gate:** Database invariants, transactional correctness, Swagger contracts, audit coverage, unit/integration/concurrency tests, and operational readiness accepted.

## Milestone 2 — Compliance Foundation

**Status:** Blocked by Milestones 0–1

Ordered scope:

1. Identity and RBAC acceptance
2. Audit Logging acceptance
3. Consent Management
4. Verification Engine
5. Privacy Center
6. Data Retention
7. Policy Engine

Controlled-medicine workflows remain out of scope.

## Milestone 3 — Supplier and Procurement

Supplier profiles, categories, verification, ratings, purchase orders, approvals, cancellation, goods receipt, batch/expiry capture, inventory update, and supplier dashboard.

## Milestone 4 — Pharmacy

Pharmacy profiles, licenses, staff, catalog operations, reservations, dispensing/sales, billing, invoices, reports, and pharmacy analytics.

## Milestone 5 — Hospital

Hospital profiles, departments, branches, staff, beds, appointments, calendars, and dashboards.

## Milestone 6 — Doctor

Registration, verification, profile, schedule, leave, appointments, prescriptions, medical notes, and dashboard.

## Milestone 7 — Laboratory

Laboratory profiles, tests, orders, sample collection, reports, and dashboard.

## Milestone 8 — Patient

Patient profile, consent-aware medical history, prescriptions, reports, reservations, appointments, downloads, privacy, and dashboard.

## Milestone 9 — Platform Services

Notification engine, analytics, exports/reporting, administrative controls, feature flags, and system settings. Each service is split into focused sprints rather than combined implementation tasks.

## Milestone 10 — Frontend

Authentication, responsive dashboards and workflows for accepted backend modules, accessibility, dark mode, and contract-tested API integration.

## Milestone 11 — Verification and Production Release

Unit, integration, API, E2E, security, performance, and load testing; Docker; CI/CD; monitoring; backups; disaster recovery; logging; production environment; operational runbooks; compliance-control review.

## Milestone 12 — AI Version 2

AI Pharmacist, Doctor Assistant, Laboratory Assistant, Hospital Assistant, Inventory Assistant, and AI Analytics.

AI work requires accepted data governance, model-risk controls, prompt standards, evaluation, auditability, human approval rules, privacy controls, and rollback/disable mechanisms. AI may not independently diagnose, prescribe, or approve high-impact clinical actions.

## Future integrations

- India: ABHA, ABDM, UHI, Health Facility Registry, Healthcare Professional Registry
- Global readiness: multi-country tenancy, configurable policy/retention, GDPR-aligned privacy controls, and HIPAA-aligned safeguards where applicable

Every integration requires its own discovery, legal/compliance review, ADRs, threat model, and acceptance criteria. Roadmap placement is not a compliance claim.

## Milestone movement rule

A milestone moves to complete only after implementation review, required migrations, security and tenant review, tests, lint, build, documentation updates, and CTO acceptance. Work may be researched in advance, but implementation may not skip an incomplete dependency.

## Next milestone recommendations

After RC1 is accepted by the CTO:

1. **S0.4 Tenant-safe RBAC and audit integration** — tenant-scope all RBAC operations, integrate audit logging into business mutations, and add comprehensive tenant-isolation tests.
2. **S0.5 Inventory ledger and reservation integrity** — resolve transaction/concurrency defects in reservation and stock operations, consolidate competing implementations, and add concurrency tests.
3. **Consent and privacy foundations** — implement consent management and privacy controls before medical-record functionality.
4. **Automated test coverage expansion** — increase coverage outside the S0.3 identity/session boundary.
5. **Performance optimization** — review and optimize Prisma queries, add missing indexes, and review transaction boundaries.
