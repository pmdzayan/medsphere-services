# AG-02 Program State

**Program:** `AG-02-COMPLETION`  
**Updated:** 2026-08-08  
**Status:** `AG02_PROGRAM_BLOCKED`

## Recovery state

| Field                          | Value                                                                                                                                                                           |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Active loop                    | Loop 1 — AG-02A clean acceptance remediation (blocked)                                                                                                                          |
| Active branch                  | `cto/ag02a-session-persistence-remediation`                                                                                                                                     |
| Starting commit                | `8b9127b5cfd005aa843ea5e1c5a650ddee57f80b`                                                                                                                                      |
| Current HEAD                   | `7b81c8cea09a4288f03a08beb267cdbde735e634` before the Loop 1 blocked-state report commit                                                                                        |
| Completed loops                | Loop 0                                                                                                                                                                          |
| Validation status              | Cold Auth lifecycle fixed; two fresh no-cache Auth runs passed; patch applies cleanly; database acceptance remains unavailable                                                  |
| Blocking findings              | PostgreSQL 16 and Docker are unavailable; the exposed external PostgreSQL role cannot be rotated or verified from this environment                                              |
| Next exact action              | Import the missing post-`8b9127b` source/evidence bundle or provide a disposable PostgreSQL 16 runtime plus safe boolean proof that the exposed role credential was invalidated |
| External evidence directory    | `/workspace/scratch/4e026a3d93a3/evidence/ag02-loop0` and `/workspace/scratch/4e026a3d93a3/evidence/ag02a-remediation`                                                          |
| Preservation branches          | `preserve/ag02-codex-recovery-20260808` at `8b9127b`                                                                                                                            |
| Disposable database names used | None                                                                                                                                                                            |
| Last successful command        | Fresh Auth run 2: 18 suites passed, 122 tests passed, 3 infrastructure suites skipped                                                                                           |
| Last failed command            | Root lint: pre-existing reservation-service TSConfig exclusion                                                                                                                  |
| Final artifact status          | Valid AG-02A review patch created; final program bundle and ZIP not created because the gate is blocked                                                                         |

## Source recovery notes

- The authoritative submitted bundle is complete through `8b9127b` on
  `cto/ag02a-session-persistence-remediation` and descends from the verified
  AG-01 base `87bbb37`.
- Later evidence names local-only commits `401fc79`, `5827f40`, and `92faeea`,
  but those objects are absent from the submitted bundle and the connected
  GitHub repository. They are evidence references, not usable source state.
- The repository is therefore continuing on the preserved recovery lineage
  from `8b9127b`; no missing commit is being fabricated or marked present.

## Advancement rule

AG-02B implementation must not begin while the program is
`AG02_PROGRAM_BLOCKED`.
