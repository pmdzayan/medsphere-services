# V1 Subsystem Gap Matrix

**Audit date:** 2026-08-08

**Accepted source commit:** `7b2eb7821b27d212a6aebdb96610d81dd08832f1`

**Decision:** Version 1 is not release-ready. The evidence-weighted full-roadmap
estimate remains approximately **30% complete**.

## Accepted since the prior gate audit

- G3.3 provider reservation reads and staff transitions passed PostgreSQL/Redis
  quality run `30753450235` and merged in PR #13 as `d84dee0`.
- AG-01 application-boundary enforcement and transport-neutral event contracts
  passed quality run `31275757316` and merged in PR #15 as `ba172f1`.
- Corrected AG-02A durable refresh-credential integrity passed quality run
  `31276741918` and merged in PR #16 as `9c38792`.
- Unsafe recovery PR #14 was closed. It is not an accepted source boundary.

## Evidence-weighted matrix

The readiness score is a planning aid, not a completion or compliance claim.

| Subsystem                                 | Accepted evidence                                                                                                        | Missing before V1 acceptance                                                                               | Readiness |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- | --------: |
| Architecture, repository, CI              | ADR governance, reproducible migrations, dependency audit, boundary checker, lint/test/build gates                       | Modular-monolith consolidation, ownership completion, release operations                                   |    8.5/10 |
| Identity, sessions, RBAC, audit           | Trusted login/refresh, tenant context, session replay protection, RBAC administration, durable audit                     | Operational retention, key rotation/runbooks, broader compliance controls                                  |    8.8/10 |
| Inventory and reservations backend        | Ledger/FEFO integrity, provider stock reads, listing/receipt/adjustment commands, provider reservation reads/transitions | Safe creation, worker expiry, transfers, returns, damage, quarantine/recall, analytics                     |    7.5/10 |
| Connected frontend                        | Login, shell, team/RBAC, audit, onboarding, privacy settings, assigned-provider stock                                    | Pharmacy preview and most role journeys remain unconnected                                                 |    4.8/10 |
| API gateway/application composition       | Health scaffold and shared HTTP controls                                                                                 | Accepted product routing/composition, contract tests, rate/timeout policy, observability                   |    1.5/10 |
| Master patient index and clinical records | Schema-only medical-record foundation                                                                                    | Patient identity resolution, consent-aware access, encounters, notes, prescriptions, UI                    |    1.0/10 |
| Compliance foundation                     | RBAC, audit, limited personal preference/privacy settings                                                                | Consent, verification, retention, deletion, legal hold, purpose/policy enforcement                         |    2.0/10 |
| Unified event delivery                    | Transport-neutral event envelope only                                                                                    | Outbox/inbox persistence, dispatcher, idempotent consumers, retry/dead-letter evidence                     |    1.0/10 |
| Notifications                             | Health-only application                                                                                                  | Templates, preferences, email/SMS/push adapters, workers, delivery evidence                                |    0.5/10 |
| Billing and finance                       | Health-only application and schema fragments                                                                             | Invoices, journal, payments, insurance, reconciliation, audit, UI                                          |    0.5/10 |
| Search and availability                   | Health-only application                                                                                                  | Tenant-safe discovery, geospatial/resource availability models and contracts                               |    0.5/10 |
| Documents and workflow                    | No accepted runtime boundary                                                                                             | Storage, signatures, access policy, workflow definitions, approvals, audit                                 |    0.0/10 |
| Supplier and procurement                  | No accepted end-to-end workflow                                                                                          | Supplier verification, purchase orders, approvals, receipt integration, dashboard                          |    0.5/10 |
| Production operations                     | PR quality gates and deployment freeze                                                                                   | Deployment, secrets operations, observability, backup/restore, DR, performance, penetration test, runbooks |    2.0/10 |

## Dependency-ordered closure path

1. Synchronize status and handoff documents to accepted commit `7b2eb78`.
2. G3.4 exact-commit evidence for the live assigned-provider stock workspace —
   accepted in PR #18.
3. Define and accept G3.5: connect assigned-provider reservation reads before
   exposing lifecycle mutations in the browser.
4. Add remaining inventory operations as separate contracts: safe reservation
   creation and worker expiry, transfers, returns, damage, quarantine/recall.
5. Complete the compliance foundation before exposing patient or clinical data.
6. Build event delivery before notification, workflow, analytics, or other
   asynchronous platform behavior claims completion.
7. Implement the remaining healthcare and platform milestones, then execute the
   production verification milestone.

## Next bounded implementation unit

**G3.5 — Live assigned-provider reservation workspace** is next after G3.4
acceptance. Its contract must remain read-only and depend only on accepted
provider-access and reservation-read contracts. G3.4 provides the reusable
assigned-provider BFF pattern. G3.5 must require:

- an exact-shape provider-context response for the authenticated membership;
- a strict same-origin BFF that never accepts client-supplied identity/tenant;
- bounded reservation query and response validation with `private, no-store`
  behavior;
- explicit empty, unauthenticated, forbidden, malformed-upstream, and upstream
  unavailable states;
- frontend rendering only from accepted reservation fields after contract tests;
- no stock mutation, reservation mutation, patient exposure, payment, delivery,
  or analytics scope.

## Release decision

No V1 score of 9/10 or production approval is justified yet. Final acceptance
requires every in-scope V1 subsystem to meet its contract, security, migration,
test, operational, and review gates—not merely a green monorepo build.
