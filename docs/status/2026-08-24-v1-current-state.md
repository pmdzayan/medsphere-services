# MedSphere V1 Current State — 2026-08-24

This file is a current-state overlay for stale summary documents and must be read together with accepted ADRs, merged PRs, sprint acceptance records, and exact-head CI evidence. It does not replace those authorities.

## Current accepted state

- Post-Audit Stabilization Batch 1 is formally complete at 5/5 accepted tasks. The final governance acceptance merged in PR #84.
- Frontend Batch 1 operational hardening is merged through Task 5.
- Batch 2 Task 1 stock-transfer authorization coverage merged in PR #85.
- Batch 2 Task 2 public medicine search and safe staff-assisted reservation handoff merged in PR #86.
- Batch 2 Task 3 SMTP/email provider activation merged in PR #87.
- Batch 2 Task 4 reproducible localhost bootstrap merged in PR #88.
- Clean-machine boot blockers identified during later runtime work were corrected and merged in PR #91.
- Runtime certification slices were merged for Dashboard (PR #99), Inventory (PR #100), Reservations (PR #101), and Stock Transfers (PR #102).
- Notification worker standalone-entrypoint hardening merged in PR #103 at merge commit `e8d7d5f7166ced20c0ad39e31fd2b99e4f0f5e19` after exact-head Quality Gates plus Dashboard, Reservations, and Stock Transfer runtime-certification workflows all passed.

## Superseded summary statements

`PROJECT_STATUS.md` and `AI_HANDOFF.md` still contain an older statement that Post-Audit Stabilization Batch 1 is 4/5 with Task 5 pending. That statement is stale and must not govern new work. PRs #83 and #84 prove Task 5 acceptance and Batch 1 completion.

The older `PROJECT_STATUS.md` 40%/60% roadmap estimate is also stale. `README.md` later recorded approximately 73% of launch-targeted V1 engineering complete as of 2026-08-21. Since that estimate, additional clean-machine/runtime certification and notification-worker hardening have merged. No new percentage is declared here without a fresh full-roadmap reconciliation.

## Launch boundary

The supported V1 runtime remains centered on:

- `apps/auth-service`
- `apps/web`
- PostgreSQL 16
- Redis 7

Production approval and real-healthcare-data use remain disabled.

## Highest-priority remaining implementation concern

The notification worker is now manually invocable as a bounded one-shot process, but PR #103 deliberately did not add any production scheduler or continuous worker deployment. If launch-targeted reservation email notifications are expected to run without an operator manually executing the command, the next bounded implementation task should be **Notification Worker Operational Scheduling/Deployment**.

That task must first establish the deployment model actually intended for V1. It may add only the minimum supported invocation mechanism needed by that model. It must not invent a queue architecture, new notification semantics, new providers, or unrelated infrastructure.

Acceptance must prove at minimum:

1. automatic invocation is explicit and bounded;
2. overlapping invocations cannot violate the existing lease/claim semantics;
3. failure/non-zero exit is observable and does not become a false success;
4. secrets remain environment-managed and absent from repository/logs;
5. disabled/misconfigured provider behavior remains fail-closed;
6. the worker opens no HTTP listener;
7. exact-head quality gates and an operational runtime certification pass before merge.

If the chosen V1 deployment model intentionally excludes automatic background execution, this task must instead record that decision explicitly and remove notification delivery from launch claims. Do not silently treat a manually invocable worker as continuously operated.

## Other remaining launch work

After the notification-worker operational decision, remaining work continues to include deployment hardening, secrets/configuration management, observability/alerting, backup/restore and disaster-recovery evidence, performance/reliability testing, browser end-to-end acceptance, final security/privacy verification, launch runbooks, and final release governance.

Open legacy runtime-certification PRs based on older branch heads must not be treated as current implementation authority merely because they remain open. New work must branch from the current accepted `feature/database-architecture` head and re-establish evidence against that exact base.

**Release state: NOT approved for production or real healthcare data.**
