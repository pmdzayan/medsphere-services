# V1 Subsystem Gap Matrix

**Audit date:** 2026-08-08

**Accepted source commit:** `72fc92a552e0cd44b074aef310d1199513bdf2e0`

**Decision:** Version 1 is not release-ready. The evidence-weighted full-roadmap
estimate is approximately **34% complete**.

## Accepted since the prior gate audit

- G3.3 provider reservation reads and staff transitions passed PostgreSQL/Redis
  quality run `30753450235` and merged in PR #13 as `d84dee0`.
- AG-01 application-boundary enforcement and transport-neutral event contracts
  passed quality run `31275757316` and merged in PR #15 as `ba172f1`.
- Corrected AG-02A durable refresh-credential integrity passed quality run
  `31276741918` and merged in PR #16 as `9c38792`.
- Unsafe recovery PR #14 was closed. It is not an accepted source boundary.
- G3.4–G3.6 replaced fabricated inventory, reservation, and dashboard previews
  with accepted assigned-provider reads and responsive workspaces.
- G3.7 reservation expiry passed exact-head CI and merged in PR #26 as
  `b7bba10`.
- G3.8 completed transfers passed exact-head CI and merged in PR #29 as
  `5521ad5`.
- G3.9 damaged-stock write-off passed exact-head CI and merged in PR #32 as
  `72fc92a`.

## Evidence-weighted matrix

The readiness score is a planning aid, not a completion or compliance claim.

| Subsystem                                 | Accepted evidence                                                                                                       | Missing before V1 acceptance                                                                               | Readiness |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | --------: |
| Architecture, repository, CI              | ADR governance, reproducible migrations, dependency audit, boundary checker, lint/test/build gates                      | Modular-monolith consolidation, ownership completion, release operations                                   |    8.5/10 |
| Identity, sessions, RBAC, audit           | Trusted login/refresh, tenant context, session replay protection, RBAC administration, durable audit                    | Operational retention, key rotation/runbooks, broader compliance controls                                  |    8.8/10 |
| Inventory and reservations backend        | Ledger/FEFO integrity, reads, commands, reservation lifecycle/expiry, completed transfers, and damage write-off         | Batch-expiry reconciliation, safe creation, returns, quarantine/recall, analytics                          |    8.3/10 |
| Connected frontend                        | Login, shell, team/RBAC, audit, onboarding, settings, assigned-provider stock, reservations, and truthful live overview | Mutation journeys and most healthcare role journeys remain unconnected                                     |    6.5/10 |
| API gateway/application composition       | Health scaffold and shared HTTP controls                                                                                | Accepted product routing/composition, contract tests, rate/timeout policy, observability                   |    1.5/10 |
| Master patient index and clinical records | Schema-only medical-record foundation                                                                                   | Patient identity resolution, consent-aware access, encounters, notes, prescriptions, UI                    |    1.0/10 |
| Compliance foundation                     | RBAC, audit, limited personal preference/privacy settings                                                               | Consent, verification, retention, deletion, legal hold, purpose/policy enforcement                         |    2.0/10 |
| Unified event delivery                    | Transport-neutral event envelope only                                                                                   | Outbox/inbox persistence, dispatcher, idempotent consumers, retry/dead-letter evidence                     |    1.0/10 |
| Notifications                             | Health-only application                                                                                                 | Templates, preferences, email/SMS/push adapters, workers, delivery evidence                                |    0.5/10 |
| Billing and finance                       | Health-only application and schema fragments                                                                            | Invoices, journal, payments, insurance, reconciliation, audit, UI                                          |    0.5/10 |
| Search and availability                   | Health-only application                                                                                                 | Tenant-safe discovery, geospatial/resource availability models and contracts                               |    0.5/10 |
| Documents and workflow                    | No accepted runtime boundary                                                                                            | Storage, signatures, access policy, workflow definitions, approvals, audit                                 |    0.0/10 |
| Supplier and procurement                  | No accepted end-to-end workflow                                                                                         | Supplier verification, purchase orders, approvals, receipt integration, dashboard                          |    0.5/10 |
| Production operations                     | PR quality gates and deployment freeze                                                                                  | Deployment, secrets operations, observability, backup/restore, DR, performance, penetration test, runbooks |    2.0/10 |

## Dependency-ordered closure path

1. G3.4–G3.6 assigned-provider stock, reservation, and truthful overview —
   accepted.
2. G3.7 reservation expiry, G3.8 completed transfers, and G3.9 damaged-stock
   write-off — accepted.
3. Verify and accept the implemented G3.10 physical batch expiry reconciliation
   without fabricating disposal.
4. Add remaining inventory operations as separate contracts: safe reservation
   creation, returns, quarantine/recall, expiry visibility, and analytics.
5. Complete the compliance foundation before exposing patient or clinical data.
6. Build event delivery before notification, workflow, analytics, or other
   asynchronous platform behavior claims completion.
7. Implement the remaining healthcare and platform milestones, then execute the
   production verification milestone.

## Next bounded implementation unit

**G3.10 — Physical batch expiry reconciliation** is next. Its accepted
[sprint contract](../sprints/G3.10-physical-batch-expiry-reconciliation.md) is a
medicine-safety checkpoint that must:

- use authoritative database time and bounded stable selection;
- expire affected reservations and release every exact hold atomically;
- mark due batches `EXPIRED` while preserving physical on-hand quantity;
- record immutable tenant-system evidence without a stock movement; and
- add no disposal, quarantine, recall, return, alert, notification, HTTP,
  permission, frontend, gateway, or analytics claim.

## Release decision

No V1 score of 9/10 or production approval is justified yet. Final acceptance
requires every in-scope V1 subsystem to meet its contract, security, migration,
test, operational, and review gates—not merely a green monorepo build.
