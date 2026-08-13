# MedSphere Product Roadmap

**Version:** 1.2

**Planning model:** Milestone → Sprint → Task → Checklist → Completion criteria

This roadmap preserves the MedSphere product vision while inserting the engineering stabilization dependency required by the 2026-07-20 CTO audit.

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
18. G3.11 One-way manual batch quarantine — contract accepted; implementation
    not started

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

## Milestone 5A — Blood Bank and Live Blood Availability

**Status:** Planned for V1; not implemented.

**Purpose:** Build a clinically controlled hospital-to-blood-bank network for near-real-time blood-component availability. The feature is primarily B2B: an authorized hospital or clinician records a real blood requirement, MedSphere discovers verified provider availability, and authorized blood-bank staff control any hold, allocation, or release.

**Primary users:** Hospital/clinical staff create and track blood requirements; blood-bank staff maintain inventory and respond to requests; doctors may initiate or confirm the clinical need under accepted policy. Patients/families receive only restricted discovery or emergency-assistance access and cannot directly reserve, allocate, select, or release a blood unit. Donor workflows are outside this V1 boundary.

**Scope:** Verified blood-bank profiles; blood-component inventory; ABO/Rh classification; unit/bag identifiers inside the provider boundary; collection and expiry timestamps; auditable lifecycle states; clinically triggered blood-requirement records; hospital-to-blood-bank requests; near-real-time aggregate availability with freshness timestamps; authorized location-aware search; atomic provider-side holds; bounded emergency escalation; low-stock and urgent-request events; hospital and blood-bank dashboards; tenant isolation; RBAC; durable audit; concurrency and idempotency protections.

**Reference flow:** Documented patient need → authorized hospital/doctor creates or confirms requirement → MedSphere searches verified aggregate availability → hospital sends request → blood bank confirms and may create an atomic hold → crossmatch/compatibility testing and final unit selection remain in the clinical/blood-bank workflow → authorized blood-bank release and lifecycle evidence are recorded.

**Clinical/privacy boundary:** Public or patient-facing views expose safe aggregate availability and provider information only. Donor identity and sensitive unit-level clinical data are not exposed. A displayed availability count is not a guarantee of suitability for a specific patient. MedSphere does not determine transfusion compatibility or clinical release from ABO/Rh alone; crossmatch, compatibility testing, final unit selection, and transfusion authorization remain blood-bank/clinical responsibilities.

**Dependencies:** Core inventory safety; compliance prerequisites; verified-provider authority; shared search/live-availability infrastructure; event delivery; notification platform; hospital/blood-bank frontend integration; restricted patient discovery/emergency assistance; production verification.

**Completion gate:** Accepted schema and migrations; tenant-safe authorization; verified-provider authority; immutable inventory evidence; audit coverage; concurrency/idempotency tests; API contracts; real PostgreSQL integration evidence; hospital/blood-bank workflows; restricted patient-facing behavior; exact-head CI; security/privacy review; CTO acceptance.

Detailed scope: [V1 Blood Bank and Live Blood Availability Scope](docs/sprints/V1-blood-bank-live-availability-scope.md).

## Milestone 6 — Doctor

Registration, verification, profile, schedule, leave, appointments, prescriptions, medical notes, and dashboard.

## Milestone 7 — Laboratory

Laboratory profiles, tests, orders, sample collection, reports, and dashboard.

## Milestone 8 — Patient

Patient profile, consent-aware medical history, prescriptions, reports, reservations, appointments, downloads, privacy, and dashboard.

## Milestone 9 — Platform Services

Shared event delivery, notification engine, search/live-availability infrastructure, analytics, exports/reporting, administrative controls, feature flags, and system settings. Each service is split into focused sprints rather than combined implementation tasks.

## Milestone 10 — Frontend

Authentication, responsive dashboards and workflows for accepted backend modules, accessibility, dark mode, and contract-tested API integration. Blood availability frontend scope prioritizes hospital and blood-bank staff workflows. Patient-facing behavior, if enabled by policy, is limited to safe aggregate facility discovery, emergency assistance, and non-sensitive request status; patients do not directly reserve individual blood units.

## Milestone 11 — Verification and Production Release

Unit, integration, API, E2E, security, performance, and load testing; Docker; CI/CD; monitoring; backups; disaster recovery; logging; production environment; operational runbooks; compliance-control review.

## Milestone 12 — AI Version 2

AI Pharmacist, Doctor Assistant, Laboratory Assistant, Hospital Assistant, Inventory Assistant, and AI Analytics.

AI work requires accepted data governance, model-risk controls, prompt standards, evaluation, auditability, human approval rules, privacy controls, and rollback/disable mechanisms. AI may not independently diagnose, prescribe, approve high-impact clinical actions, or select blood products for transfusion.

## Future integrations

- India: ABHA, ABDM, UHI, Health Facility Registry, Healthcare Professional Registry
- Blood networks: national/state blood-network integrations require separate discovery, legal/compliance review, contracts, and operational authority
- Global readiness: multi-country tenancy, configurable policy/retention, GDPR-aligned privacy controls, and HIPAA-aligned safeguards where applicable

Every integration requires its own discovery, legal/compliance review, ADRs, threat model, and acceptance criteria. Roadmap placement is not a compliance claim.

## Milestone movement rule

A milestone moves to complete only after implementation review, required migrations, security and tenant review, tests, lint, build, documentation updates, and CTO acceptance. Work may be researched in advance, but implementation may not skip an incomplete dependency.
