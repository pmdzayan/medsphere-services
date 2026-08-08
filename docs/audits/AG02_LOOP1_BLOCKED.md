# AG-02 Loop 1 — AG-02A Acceptance Remediation Blocked

**Date:** 2026-08-08  
**Status:** `AG02_LOOP_1_BLOCKED`  
**Program status:** `AG02_PROGRAM_BLOCKED`

## Completed remediation

- Added an explicit 60-second lifecycle budget to the assembled Auth HTTP E2E
  bootstrap and teardown hooks.
- Committed the runtime-independent test fix as `7b81c8c`.
- Created a fresh detached worktree from `7b81c8c`.
- Installed the locked PNPM 9.15.0 dependency graph in the fresh worktree.
- Generated Prisma Client and built the directly affected packages.
- Ran the full Auth suite twice with no Jest cache and open-handle detection.
- Generated a byte-preserving binary patch from `87bbb37` and proved
  `git apply --check` succeeds from a detached `87bbb37` worktree.

## Validation evidence

| Gate                        | Result                                                                                                                    |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Fresh Auth run 1            | 18 suites passed; 122 tests passed; 3 infrastructure suites and 23 infrastructure tests skipped                           |
| Fresh Auth run 2            | 18 suites passed; 122 tests passed; 3 infrastructure suites and 23 infrastructure tests skipped                           |
| Cold lifecycle behavior     | Passed; the first fresh run exceeded the former 5-second hook limit without timing out                                    |
| Open handles                | No leaked worker or open-handle warning in either run                                                                     |
| Auth lint                   | Passed                                                                                                                    |
| Auth build                  | Passed                                                                                                                    |
| Common lint                 | Passed                                                                                                                    |
| Common tests                | 18 passed through Node's test runner; the package `tsx` CLI itself is blocked by an execution-environment IPC restriction |
| Common build                | Passed                                                                                                                    |
| Types build                 | Passed                                                                                                                    |
| Logger build                | Passed                                                                                                                    |
| Root formatting             | Passed                                                                                                                    |
| Architecture boundary check | Passed                                                                                                                    |
| Root build                  | 15 of 15 tasks passed                                                                                                     |
| Root lint                   | Blocked by the pre-existing reservation-service test TSConfig exclusion; no AG-02 file is implicated                      |
| Patch validation            | Passed against `87bbb37`                                                                                                  |
| Fresh worktree              | Clean after validation                                                                                                    |

The session repository, session policy, Prisma schema, and migration chain have
no diff from the previously database-tested runtime commit `d780a43` through
`7b81c8c`. Earlier CTO review accepted three PostgreSQL session runs at 11
tests passed per run, but the master completion gate requires current fresh
PostgreSQL evidence and does not permit critical infrastructure skips.

## Blocking conditions

1. PostgreSQL 16, `psql`, Docker, and an equivalent disposable database runtime
   are unavailable in the current execution environment.
2. The exposed PostgreSQL role exists on an external development machine. This
   environment cannot rotate that role or verify safe boolean old/new
   authentication results.
3. Evidence names later local-only commits `401fc79` and `5827f40`, but those
   Git objects were not uploaded in the source bundle and are absent from the
   connected GitHub repository.

These are real acceptance blockers. Treating previously reported claims as
current proof would violate the AG-02 evidence contract.

## Required unblock

Supply either:

- a complete Git bundle containing the later AG-02A remediation commits and
  their safe credential-rotation evidence; or
- a disposable PostgreSQL 16 execution path and safe boolean proof that the
  actually exposed external role credential was invalidated.

AG-02B implementation did not begin.

`AG02_PROGRAM_BLOCKED`
