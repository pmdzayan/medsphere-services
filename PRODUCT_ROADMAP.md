# AIM — All In Medico Product Roadmap

**Version:** 1.3

**Planning model:** Milestone → Sprint → Task → Checklist → Completion criteria

This roadmap preserves the AIM — All In Medico product vision while inserting the engineering stabilization dependency required by the 2026-07-20 CTO audit.

## Milestone 0 — Architecture and Safety Stabilization

**Status:** In progress

**Purpose:** Make the existing foundation reproducible, secure, testable, and truthful before new features.

Ordered sprints:

1. S0.1 Architecture and repository governance — accepted
2. S0.2 Reproducible database baseline — accepted and merged
3. S0.3 Authentication and trusted tenant context — accepted and merged
4. S0.4 Tenant-safe RBAC and durable audit — accepted and merged
5. S0.5 Inventory ledger and reservation integrity — accepted and merged in
   PR #10 as `410368c`
6. G3.1 Trusted provider stock read — accepted and merged in PR #11 as `77689b5`
7. G3.2 Trusted listing configuration, batch receipt, and stock adjustment —
   accepted and merged in PR #12 as `3249f8a`
8. G3.3 Assigned-provider reservation reads and staff lifecycle transitions —
   accepted and merged in PR #13 as `d84dee0`
9. AG-01 application boundaries and domain-event contracts — accepted and
   merged in PR #15 as `ba172f1`
10. AG-02A durable session credential integrity — accepted and merged in PR #16
    as `9c38792`
11. G3.4 Live assigned-provider stock workspace — accepted and merged in PR #18
    as `7b2eb78`
12. G3.5 Live assigned-provider reservation workspace — accepted and merged in
    PR #20 as `6c68ee3`
13. G3.6 Live operations overview — accepted and merged in PR #23 as `63707b8`
14. G3.7 Reservation expiry worker — accepted and squash-merged in PR #26 as
    `b7bba10`
15. G3.8 Completed inventory transfer — accepted and squash-merged in PR #29
    as `5521ad5`
16. G3.9 Completed damaged-stock write-off — accepted and squash-merged in PR
    #32 as `72fc92a` after exact-head CI run `31371305767`
17. G3.10 Physical batch expiry reconciliation — accepted and squash-merged in
    PR #35 as `ad2d15b` after exact-head CI run `31393057704`
18. G3.11 One-way manual batch quarantine — accepted and squash-merged in PR
    #38 as `d364794` after exact-head CI run `31761072418`
19. G3.12 Live assigned-provider batch quarantine workspace — accepted and
    squash-merged in PR #41 as `85fdf53` after exact-head CI run `31762213509`
20. G3.13 Live assigned-provider damaged-stock write-off — accepted and
    squash-merged in PR #42 as `636eb86` after exact-head CI run `31763244493`
21. G3.14 Live assigned-provider reservation lifecycle actions — accepted and
    squash-merged in PR #43 as `7feacbb` after exact-head CI run `31763879935`
22. G3.15 Live completed inventory transfer — accepted and squash-merged in PR
    #44 as `bc26e2a` after exact-head CI run `31764479220`
23. G3.16 Assigned-provider staff reservation creation — accepted and
    squash-merged in PR #46 as `3c92e5d` after exact-head CI run `31767059794`
24. G3.17 Live staff reservation creation — accepted and squash-merged in PR
    #47 as `9f733a7` after exact-head CI run `31767805254`
25. G3.18 Assigned-provider expiry worklist — accepted and squash-merged in PR
    #48 as `7c0befb` after exact-head CI run `31768462051`
26. G3.19 Live expiry worklist workspace — accepted and squash-merged in PR #49
    as `8e5db0b` after exact-head CI run `31769276564`
27. G3.20 Bounded quarantine investigation evidence — accepted and squash-merged
    in PR #50 as `bed136e` after exact-head CI run `31769816895`
28. G3.21 Transactional event delivery foundation — accepted and squash-merged
    in PR #52 as `af48522` after exact-head CI run `31786107840`
29. G3.22 Atomic inventory domain event producers — accepted and squash-merged
    in PR #54 as `3e7a8c0` after exact-head CI run `31793020883`
30. G3.23 Notification delivery foundation — accepted and squash-merged in PR
    #56 as `fcc6e46` after exact-head CI run `31796185118`
31. G3.24 Reservation-ready notification consumer — accepted and squash-merged
    in PR #58 as `9594988` after exact-head CI run `31817168998`
32. G3.25 Reservation recipient resolution boundary — accepted and squash-merged
    in PR #60 as `85088de` after exact-head CI run `31952514969`

**Completion gate:** Accepted ADRs; protected review flow; clean migrations; deny-by-default authentication; tenant-isolation tests; integrated audit trail; atomic stock/reservation behavior; mandatory lint/test/build passing.

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

## Milestone 13 — Global Governance & Regional Administration

**Status:** Planned — post-India expansion; not a V1 India launch blocker.

**Purpose:** Allow AIM to expand globally with a flexible management hierarchy that can add, remove, split, merge, and reassign territories and leadership without changing application code.

**Governance hierarchy:** Global Owner → Regional Executive → Country Head/Admin → Healthcare Organization → Organization Staff.

Ordered scope:

1. GG13.1 Global-owner authority and protected owner controls.
2. GG13.2 Dynamic territory model for regions, countries, and future sub-regions.
3. GG13.3 Regional Executive lifecycle: create, assign, suspend, reactivate, and remove.
4. GG13.4 Country Head/Admin lifecycle beneath assigned Regional Executives.
5. GG13.5 Territory assignment, reassignment, split, merge, and transfer workflows.
6. GG13.6 Hierarchical authorization with deny-by-default regional and country isolation.
7. GG13.7 Delegated administration with no privilege escalation beyond the delegating leader.
8. GG13.8 Separation of business-management authority from clinical/patient-data authority.
9. GG13.9 Global Owner dashboard with cross-region and cross-country visibility.
10. GG13.10 Regional Executive dashboard limited to assigned territories only.
11. GG13.11 Country dashboard and organization-level operational rollups.
12. GG13.12 Revenue attribution by country, region, and responsible executive while retaining original transaction currency.
13. GG13.13 Performance scorecards for revenue, growth, subscriptions, active organizations, retention/churn, support performance, incidents, and compliance indicators.
14. GG13.14 Financial and operational approval thresholds for sensitive actions such as major refunds, pricing changes, discounts, and other configured high-impact decisions.
15. GG13.15 Immutable audit evidence for leadership changes, territory changes, delegated permissions, financial approvals, and sensitive administrative actions.
16. GG13.16 Immediate executive/admin suspension and session revocation.
17. GG13.17 Temporary delegation with explicit scope, start/end time, and automatic expiry.
18. GG13.18 Multi-currency reporting and normalized global reporting views without rewriting source transaction values.
19. GG13.19 Country-aware policy, privacy, retention, and data-residency boundaries.
20. GG13.20 Cross-region/cross-country isolation, authorization, concurrency, audit, and regression certification.

**Security boundary:** A leadership role does not automatically grant access to patient medical records, prescriptions, lab results, or other clinical data. Business, financial, security, administrative, and clinical permissions must remain separately modeled and independently authorized.

**Scalability rule:** The implementation must never hard-code four CEOs, fixed compass directions, or a fixed number of regions. Leadership and territory assignments must be data-driven so AIM can grow from a small initial regional structure to any future number of executives and territories.

**Completion gate:** Global-owner controls accepted; territory reassignment safe and auditable; regional/country isolation proven; no privilege escalation; business/clinical permission separation proven; session revocation tested; financial attribution reconciled; multi-currency reporting validated; country-policy/data-residency boundaries documented; required migrations, tests, lint, build, threat model, ADRs, and CTO acceptance complete.

## Milestone 14 — Application Versioning & Update Management

**Status:** Planned. Backend/web release controls support production operations; native-store update tasks apply when AIM is distributed through mobile app stores.

**Purpose:** Make AIM updates safe and simple for users across V1, future major versions, routine feature releases, and urgent security patches while preserving accounts, organization data, and compatible healthcare workflows.

Ordered scope:

1. UM14.1 Canonical application-version model and release policy covering major, minor, patch, build, API, and database-schema compatibility.
2. UM14.2 Signed/versioned update-manifest service exposing current version, minimum supported version, update severity, release notes reference, and supported client platforms without exposing secrets.
3. UM14.3 Web/PWA update detection with safe refresh/reload behavior and a user-facing `Update now` flow when a new frontend build is available.
4. UM14.4 Optional-versus-required update UX so normal releases may be deferred while critical security or incompatible releases can require an upgrade before continued use.
5. UM14.5 Minimum-supported-client enforcement that fails safely and never silently allows a client version known to be incompatible or unsafe.
6. UM14.6 Android/iOS store-release boundary for directing users to the official Google Play or Apple App Store update path when native applications are published.
7. UM14.7 Backend/API compatibility policy allowing controlled overlap between old and new clients during rollout instead of breaking every existing session immediately.
8. UM14.8 Backward-compatible database migration and data-preservation rules so V1 → V2 → later upgrades retain valid user accounts, organizations, inventory, reservations, subscriptions, audit evidence, and other required records.
9. UM14.9 Release channels and feature flags for internal, test/beta, staged, and stable activation without maintaining separate unsafe product forks.
10. UM14.10 Progressive/canary rollout controls supporting bounded percentages or selected regions before full release.
11. UM14.11 Automated rollback and operational kill-switch controls for defective frontend/backend releases and independently disableable risky features where safe rollback requires it.
12. UM14.12 Emergency security-update process with expedited validation, mandatory-upgrade policy when required, session/token invalidation where relevant, and clear incident audit evidence.
13. UM14.13 Release ledger and immutable audit trail recording version, commit/build identity, migration set, approver, rollout start/stop, rollback, and security-release decisions.
14. UM14.14 Release health and adoption monitoring covering error rate, readiness, rollback triggers, version adoption, unsupported-client counts, and privacy-safe operational telemetry.
15. UM14.15 End-to-end update certification covering upgrade, rollback, data preservation, old/new-client compatibility, forced-update behavior, migration safety, security checks, and exact-release-artifact validation.

**User-experience rule:** Routine server-side releases should require no user action when compatible. Web/PWA users should receive the latest safe build automatically or through a bounded refresh prompt. Native users should update through official app-store mechanisms. Required security updates must clearly explain that an update is necessary without exposing sensitive vulnerability details.

**Data-preservation rule:** A new AIM version must not require users or healthcare organizations to recreate accounts or lose valid business/healthcare records merely because the application version changed. Any intentionally incompatible data transition requires an explicit migration, backup/restore plan, validation evidence, and rollback strategy.

**Release-safety rule:** No update goes directly from a developer change to all production users. Production releases require applicable tests, security checks, migration/drift safety, staged rollout or equivalent bounded exposure, monitoring, rollback readiness, and release approval.

**Completion gate:** Version policy accepted; update manifest and client handling proven; backward compatibility and data preservation certified; forced-security-update behavior tested; staged rollout and rollback proven; release audit evidence complete; monitoring and adoption telemetry validated; native-store flows certified when applicable; required tests, lint, build, migrations, security review, ADRs, runbooks, and CTO acceptance complete.

## Future integrations

- India: ABHA, ABDM, UHI, Health Facility Registry, Healthcare Professional Registry
- Global readiness: multi-country tenancy, configurable policy/retention, GDPR-aligned privacy controls, and HIPAA-aligned safeguards where applicable

Every integration requires its own discovery, legal/compliance review, ADRs, threat model, and acceptance criteria. Roadmap placement is not a compliance claim.

## Milestone movement rule

A milestone moves to complete only after implementation review, required migrations, security and tenant review, tests, lint, build, documentation updates, and CTO acceptance. Work may be researched in advance, but implementation may not skip an incomplete dependency.
