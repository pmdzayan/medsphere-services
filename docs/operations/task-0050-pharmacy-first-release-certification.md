# Task 0050 — Pharmacy-First Release Certification

**Engineering gate status:** repository implementation and exact-artifact certification infrastructure.  
**Production approval status:** fail closed until every repository and external evidence item below is complete.  
**Scope:** pharmacy-first V1 from Tasks 0042–0049 only. Tasks 0051+ are not bundled into this gate.

## Purpose

Task 0050 turns the existing AIM certification harnesses into one controlled pharmacy-first release decision. It does not create another runtime, test framework, database authority, monitoring stack, or deployment system.

The gate binds evidence to one exact release SHA and one immutable release artifact. A green CI run is necessary but is not, by itself, authorization for real healthcare production traffic.

## Exact release candidate

The Task 0050 workflow creates a bounded candidate ledger containing:

- full 40-character Git commit SHA;
- Git tree SHA;
- SHA-256 of a deterministic Git source archive;
- SHA-256 of the locked dependency file;
- SHA-256 of the ordered Prisma migration directory;
- exact local container image ID for the auth-service candidate;
- bounded application version derived from the release SHA.

For a real production GO decision, the evidence file must additionally contain the immutable registry image digest. A mutable image tag is not sufficient.

The release candidate workflow explicitly checks out the pull-request head SHA or the authoritative push SHA instead of relying on the default pull-request merge ref.

## Repository evidence required

Every repository evidence item must be `PASS`, must reference the same release SHA, and must contain only a bounded opaque evidence reference.

The required checks are:

1. `qualityGates` — dependency audit, clean migrations/drift, populated upgrades, formatting, lint, tests and build.
2. `productionRuntime` — production configuration, runtime, auth regression and container-safety certification.
3. `coreRuntime` — the accepted real-stack frontend/backend/PostgreSQL/Redis regression.
4. `dashboardBrowser` — real browser login, hydration, provider selection and provider-dependent reads.
5. `reservationsRuntime` — reservation lifecycle certification.
6. `stockTransferRuntime` — stock-transfer runtime certification.
7. `performanceReliability` — controlled concurrent load, post-load readiness and data-integrity certification.
8. `backupRestoreRecovery` — logical backup/restore plus deterministic recovery validation.
9. `telemetrySecurityPrivacy` — Task 0049 bounded telemetry, monitoring and de-identified analytics boundary.
10. `migrationUpgradeSafety` — exact clean and populated migration/upgrade evidence.

Task 0050 adds authoritative-branch push triggers to the accepted browser/runtime/performance/recovery workflows that previously ran only on pull requests or legacy certification branches. This ensures the final merged SHA can be independently certified rather than inheriting evidence from a pre-merge branch SHA.

## External evidence required for production GO

The repository cannot manufacture or self-attest these controls. Each item must be completed in the selected real environment and referenced by an opaque evidence identifier:

- independent security review;
- independent privacy review;
- qualified compliance review, including applicable pharmacy/tax/legal sign-off for the intended launch jurisdiction;
- real production environment and secret-injection configuration review;
- authenticated TLS operator ingress for monitoring/admin surfaces;
- real alert-delivery and incident-drill evidence;
- production backup storage plus provider snapshot/PITR evidence;
- measured recovery drill;
- canary plus rollback drill;
- incident-response drill.

`openCriticalFindings` must be exactly `0`.

The final decision also requires an explicit controlled release approval reference. The evidence contract does not accept free-form findings, patient data, credentials, email addresses, raw logs, query strings, or arbitrary extra fields.

## Evidence privacy boundary

The release evidence JSON is an index of evidence, not an evidence warehouse.

Store only:

- status;
- exact release SHA where required;
- opaque run, ticket, change-record or controlled-document references;
- immutable artifact digests;
- the count of open critical findings;
- the final approval reference.

Do not place patient information, pharmacy customer data, clinical content, credentials, tokens, alert destinations, raw penetration-test findings or private reviewer notes in this JSON or in GitHub Actions artifacts.

## Controlled decision

Generate the candidate and fail-closed template in CI or an equivalent isolated release workspace:

```bash
TASK_0050_APP_VERSION=pharmacy-v1-<short-sha> \
TASK_0050_CONTAINER_IMAGE_ID=sha256:<local-image-id> \
node scripts/pharmacy-release-certification.mjs candidate task-0050-candidate.json

node scripts/pharmacy-release-certification.mjs \
  template task-0050-candidate.json task-0050-evidence.json
```

Complete only the bounded fields after evidence exists, then evaluate against the exact authoritative SHA:

```bash
node scripts/pharmacy-release-certification.mjs \
  decide task-0050-evidence.json <full-release-sha>
```

The command exits successfully only for `GO`. Missing evidence, a mismatched SHA, a mutable/missing registry digest, any open critical finding, or missing approval returns `NO-GO` and a non-zero exit code.

## Canary and rollback boundary

A production canary must use the exact registry digest recorded in the evidence file. The selected platform may choose the cohort/traffic mechanism, but the evidence must prove that the canary was bounded, monitored and reversible.

Rollback is mandatory when readiness/smoke verification fails, security monitoring indicates a release-introduced critical condition, or pharmacy transaction/inventory integrity is not preserved.

Application rollback must follow the existing production deployment runbook:

- revert only to a known-good immutable application artifact;
- do not automatically downgrade the database schema;
- prove the previous application artifact remains compatible with the forward-migrated schema;
- otherwise invoke the accepted recovery controls instead of improvising a schema rollback.

## Backup and PITR boundary

Repository-owned logical backup/restore/recovery certification remains necessary but is not sufficient for production GO.

Provider-specific backup storage, snapshots and point-in-time recovery are deployment-environment controls. The selected production database architecture must activate and prove them before `productionBackupStorageAndPitr` may be marked `PASS`.

## Monitoring and incident boundary

Task 0049 supplies the production-reference Collector -> Prometheus -> Alertmanager path and a synthetic incident-drill client. Task 0050 requires real-environment evidence that:

- authenticated TLS operator access works;
- the synthetic alert reaches the approved on-call destination;
- monitoring failure does not break pharmacy requests;
- the incident and rollback procedures are executable by the responsible operators.

## Production delivery remains frozen by default

The repository still contains no provider-specific production deployer and no real production credentials. `secure-delivery.yml` intentionally performs no deployment.

A Task 0050 `GO` decision removes the pharmacy-first certification blocker for the exact reviewed artifact; it does not authorize an unrelated artifact, a later commit, Tasks 0051+, or a deployment path that has not been separately activated and reviewed.

## Acceptance boundary

Repository engineering acceptance for Task 0050 requires:

- the release-contract tests to pass;
- the candidate ledger to be generated for the exact SHA;
- all standard exact-SHA repository certifications to be green;
- the deployment freeze to remain fail closed;
- no feature bundling.

Real production approval additionally requires all external evidence and the final `GO` decision. Until then the correct production state is `NO-GO`.
