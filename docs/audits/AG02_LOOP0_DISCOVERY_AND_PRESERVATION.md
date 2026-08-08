# AG-02 Loop 0 — Discovery and Preservation

**Date:** 2026-08-08  
**Status:** `AG02_LOOP_0_COMPLETE`  
**Program:** `AG-02-COMPLETION`

## Objective

Recover the independently inspectable AG-02 source state, preserve it without
destructive Git operations, and identify the exact safe continuation point.

## Repository discovery

| Evidence            | Result                                              |
| ------------------- | --------------------------------------------------- |
| Recovered source    | `MedSphere_AG02A_Cline_Acceptance.bundle`           |
| Bundle verification | Complete history; SHA-1 bundle; verification passed |
| Recovered branch    | `cto/ag02a-session-persistence-remediation`         |
| Recovered HEAD      | `8b9127b5cfd005aa843ea5e1c5a650ddee57f80b`          |
| Verified AG-01 base | `87bbb37de22c1545f0d2ecb12f5340b7d278bf3a`          |
| Worktree state      | No tracked, staged, or untracked changes            |
| Worktrees           | One recovered worktree                              |
| Preservation branch | `preserve/ag02-codex-recovery-20260808`             |

The connected GitHub repository does not contain the later evidence-only SHAs
`401fc79`, `5827f40`, or `92faeea`. The latest uploaded source bundle ends at
`8b9127b`. Continuing from any later SHA would therefore be unverifiable.

## Preservation actions

- Created `preserve/ag02-codex-recovery-20260808` at the recovered HEAD.
- Wrote staged and unstaged binary preservation patches outside the repository.
- Confirmed both patches are empty because the recovered worktree was clean.
- Preserved the original bundle unchanged.
- Used no reset, clean, restore, checkout-discard, rebase, merge, push, or
  force-update operation.

## Prior evidence reconciliation

The latest CTO review of commit `8b9127b` accepted the bundle integrity,
PostgreSQL session runs, warm Auth regression, scoped package gates, and secret
scan. It left three targeted blockers:

1. invalidate the credential of the actually exposed local PostgreSQL role;
2. eliminate cold Auth E2E lifecycle flakiness and prove two cold passes;
3. generate a byte-preserving patch that applies cleanly to `87bbb37`.

Later AG-02B analysis evidence reports that the cold lifecycle issue was fixed
in `401fc79` and the remaining evidence was closed in `5827f40`, but neither
commit was submitted as source. Those claims will be used only as diagnostic
guidance.

## Environment finding

Node.js `v24.14.0` and pnpm `11.16.0` are available. PostgreSQL client/server
and Docker commands are not available in the current execution environment.
No database credential was printed or requested.

## Loop 0 gate

- Existing submitted source is preserved.
- The correct recoverable AG-02A branch and exact HEAD are identified.
- No destructive command was used.
- The next action is explicit: reproduce and verify the cold E2E lifecycle fix
  on the recovered lineage, validate the review patch, and then reassess the
  database-dependent gate.

`AG02_LOOP_0_COMPLETE`
