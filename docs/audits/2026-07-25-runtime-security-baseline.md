# Runtime and Security Baseline Audit

**Date:** 2026-07-25

**Audited base:** `5ffc36bf45b5fb2aea541b0920f650cc32fd1405`

**Release effect:** Production approval remains denied

## Findings

| Severity | Finding                                                        | Disposition |
| -------- | -------------------------------------------------------------- | ----------- |
| Critical | Rejected prototype applications mounted unauthenticated routes | Contained   |
| High     | 16 production dependency advisories                            | Remediated  |
| High     | NestJS distributed-throttler contract drift                    | Remediated  |
| High     | Validation/request-ID/server-error disclosure defects          | Remediated  |
| High     | Prisma query logging enabled by environment default            | Remediated  |
| Medium   | Missing shared HTTP security headers                           | Remediated  |
| Medium   | Test coverage does not match repository breadth                | Open        |

## Controls added

- NestJS 11 compatible dependency family and parent-scoped transitive fixes
- production dependency audit in pull-request CI
- atomic Redis counter and block state
- shared Helmet middleware
- bounded string-only errors and safe request-ID normalization
- default-off Prisma query logging
- process-level and Compose-profile gates for rejected prototypes

## Explicitly rejected code retained for S0.5

The source still contains fixed zero identities, duplicate inventory and
reservation ownership, clamped stock arithmetic, unsafe transaction-shaped
workflows, and medical-record behavior without consent/privacy controls. These
are not approved limitations. They remain only as characterization and
migration evidence and cannot run outside explicit direct development.

## Acceptance gate

Formatting, dependency audit, schema validation, lint, tests, and build must
pass. PostgreSQL 16 and Redis 7 infrastructure tests, clean migration, populated
upgrade, and drift verification must execute without skips in GitHub Actions.

## Verification evidence

[PR #9](https://github.com/pmdzayan/medsphere-services/pull/9) ran the complete
quality gate on exact commit
`a409f052f00224130da796db951d6afdbcaa0726`.
[Workflow run 30147083613](https://github.com/pmdzayan/medsphere-services/actions/runs/30147083613)
passed the locked install, production dependency audit, clean PostgreSQL 16
migration and drift verification, populated upgrade verification, formatting,
15/15 lint tasks, PostgreSQL and Redis infrastructure tests, 17/17 test tasks,
and 15/15 build tasks.

The implementation and verification are CTO-accepted. Merge into the accepted
base remains required before dependent S0.5 implementation may begin.
