# AG-02A Remediation Loop 2 — Baseline Reproduction Report

**Date:** 2026-08-04  
**Task:** AG-02A-R (Session Persistence Remediation Loop 2)  
**Agent:** Antigravity AI  
**Status:** `LOOP_2_COMPLETE`

---

## 1. Branch Preparation & Git Evidence

- **Selected Remediation Branch:** `cto/ag02a-session-persistence-remediation`
- **Base Commit:** `ebf3f46` (`docs(auth): record ag02a session persistence completion report`)
- **HEAD Commit:** `ebf3f46`
- **Ancestry Verification:**
  - `87bbb37` -> `ff10984` -> `ebf3f46`
  - Descends directly from `ebf3f46`.
- **Initial & Final Status:** Working tree clean except for preserved audit report files under `docs/audits/`.

---

## 2. PostgreSQL Inspection & Readiness

- **Port Status:** Port `5432` is listening (`TcpTestSucceeded: True`).
- **Process & Engine Version:** `postgres.exe` (PostgreSQL 18.0, 64-bit).
- **Datasource Configuration:** `DATABASE_URL` configured in `.env` pointing to `postgresql://<user>:<password>@localhost:5432/medsphere?schema=public`.
- **Current Database Status:** Database `medsphere` is present on port 5432. Initial schema `20260715163416_init_auth_schema` is applied, but subsequent migrations (`20260720020000_complete_reproducible_baseline` through `20260803120000_persistent_session_credential_rotation`) have not been applied to it yet.
- **Integration Test Safety:** Integration tests were **NOT RUN** against the unverified `medsphere` database in Loop 2 (`NOT RUN — SAFE DISPOSABLE DATABASE NOT CONFIGURED`).
- **Loop 3 Action Required:** Create and migrate a clean disposable test database `medsphere_test` on `localhost:5432` to verify full migration deploy, reset/re-apply, and run `session.repository.integration.spec.ts`.

---

## 3. Dependency Installation

Command: `pnpm install --frozen-lockfile`

- **Exit Code:** `0`
- **Duration:** 13.1 seconds
- **Warnings:** `The "pnpm" field in package.json is no longer read by pnpm. The following keys were ignored: "pnpm.overrides".`
- **Lockfile Status:** Unchanged (`Lockfile is up to date, resolution step is skipped`).

---

## 4. Focused Test Failures & Root-Cause Analysis

All test logs captured in external directory:  
`C:\Users\Lenovo\Downloads\MedSphere_AG02A_Loop2_Logs_20260804-111309\`

| Suite                         | Command                                                                                | Exit Code | Result                                              | Exact Failing Test Names                                                                                                                                                            | Root Cause                                                                                                                                 |
| :---------------------------- | :------------------------------------------------------------------------------------- | :-------: | :-------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------- |
| **Request Metadata**          | `pnpm --filter @medsphere/auth-service test -- request-metadata.spec.ts`               |    `1`    | 3 failed, 1 passed                                  | `drops an unsafe request identifier: contains whitespace`<br>`drops an unsafe request identifier: x...x (>120 chars)`<br>`drops an unsafe request identifier: patient@example.test` | **`SOURCE_DEFECT`**: `normalizeRequestId` in `@medsphere/common` missing validation for whitespace, length > 120, and email-like patterns. |
| **Route Policy**              | `pnpm --filter @medsphere/auth-service test -- route-policy.spec.ts`                   |    `1`    | 1 failed, 7 passed                                  | `marks the shared health controller public at class scope`                                                                                                                          | **`SOURCE_DEFECT`**: `HealthController` in `@medsphere/common` missing `@PublicEndpoint()` decorator.                                      |
| **App E2E**                   | `pnpm --filter @medsphere/auth-service test -- app.e2e.spec.ts`                        |    `1`    | 1 failed, 23 passed                                 | `keeps only accepted metadata and health endpoints public`                                                                                                                          | **`SOURCE_DEFECT`**: Consequence of missing `@PublicEndpoint()` on `HealthController`; `/health/live` returned 401 instead of 200.         |
| **Session Policy**            | `pnpm --filter @medsphere/auth-service test -- session-policy.spec.ts`                 |    `0`    | 15 passed                                           | None                                                                                                                                                                                | N/A (Pure unit tests passed).                                                                                                              |
| **Session Infra (No Flag)**   | `pnpm --filter @medsphere/auth-service test -- session.repository.integration.spec.ts` |    `0`    | 1 suite / 10 tests skipped                          | None                                                                                                                                                                                | N/A (Gated by `$env:RUN_AUTH_INFRASTRUCTURE_TESTS="true"`).                                                                                |
| **Session Infra (With Flag)** | `pnpm --filter @medsphere/auth-service test -- session.repository.integration.spec.ts` |    N/A    | `NOT RUN — SAFE DISPOSABLE DATABASE NOT CONFIGURED` | N/A                                                                                                                                                                                 | **`DATABASE_UNAVAILABLE`**: Deferred to Loop 3 disposable DB setup.                                                                        |

---

## 5. Quality Gates Reproduction

| Check              | Command                                       | Exit Code | Details                                                                                                                                                            |
| :----------------- | :-------------------------------------------- | :-------: | :----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Lint**           | `pnpm --filter @medsphere/auth-service lint`  |    `0`    | Clean (0 errors, 0 warnings).                                                                                                                                      |
| **Build**          | `pnpm --filter @medsphere/auth-service build` |    `0`    | Clean (NestJS build succeeded).                                                                                                                                    |
| **Format Check**   | `pnpm format:check`                           |    `1`    | Failed on 3 markdown files: `2026-08-03-cline-ag01-recovery-isolation-verification.md`, `2026-08-04-ag02a-loop1-recovery-inspection.md`, `ag01-delta-manifest.md`. |
| **Git Diff Check** | `git diff --check`                            |    `0`    | Clean (0 whitespace/conflict markers).                                                                                                                             |

---

## 6. Full Auth Service Test Baseline

Command: `pnpm --filter @medsphere/auth-service test`

- **Exit Code:** `1`
- **Runtime:** 18.28 seconds
- **Test Suites:** 3 failed, 3 skipped, 15 passed (18 of 21 total)
- **Tests:** 5 failed, 22 skipped, 117 passed (144 total)

---

## 7. Loop 3 Recommendation

Loop 3 should be:

```text
PostgreSQL disposable database and migration verification
```

**Reason:** Local PostgreSQL 18 is active on port 5432. In Loop 3, we must provision a clean disposable database (`medsphere_test`), apply the full Prisma migration chain, test migration reset/reapply, inspect schema/constraints/indexes, and run the complete infrastructure integration test suite (`session.repository.integration.spec.ts`) with `$env:RUN_AUTH_INFRASTRUCTURE_TESTS="true"`.
