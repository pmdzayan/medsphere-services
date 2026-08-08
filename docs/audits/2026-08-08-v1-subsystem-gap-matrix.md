# V1 Subsystem Gap Matrix

**Audit date:** 2026-08-08

**Accepted source commit:** `9c387920cdea06798169175877b13a1394b183ec`

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
| Connected frontend                        | Login, shell, team/RBAC, audit, onboarding, personal privacy settings                                                    | Inventory/pharmacy previews must use accepted live contracts; most role journeys absent                    |    4.0/10 |
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

1. Synchronize status and handoff documents to accepted commit `9c38792`.
2. Define and accept G3.4: resolve the current membership's assigned provider
   context and connect the inventory workspace to the accepted read-only stock
   contract through a strict same-origin BFF.
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

**G3.4 — Live assigned-provider stock workspace** is next. Its proposed
[sprint contract](../sprints/G3.4-live-assigned-provider-stock-workspace.md) is
read-only and depends only on accepted provider-access and stock-read contracts.
It requires:

- an exact-shape provider-context response for the authenticated membership;
- a strict same-origin BFF that never accepts client-supplied identity/tenant;
- bounded stock query and response validation with `private, no-store` behavior;
- explicit empty, unauthenticated, forbidden, malformed-upstream, and upstream
  unavailable states;
- frontend replacement of preview rows and metrics only after contract tests;
- no stock mutation, reservation mutation, import, barcode, or analytics scope.

## Release decision

No V1 score of 9/10 or production approval is justified yet. Final acceptance
requires every in-scope V1 subsystem to meet its contract, security, migration,
test, operational, and review gates—not merely a green monorepo build.
