# Task 0060 — Independent AI-Code Security & Data-Integrity Gate

**Version:** V2 cross-cutting engineering  
**Branch:** `cto/0060-independent-ai-code-security-data-integrity`  
**Base:** `feature/database-architecture`

## Objective

Make AI-assisted/high-risk AIM changes fail closed when they introduce known dangerous patterns, and require independent approval for healthcare authority, tenant, security, database, and gate-integrity surfaces.

## In scope

- machine-readable Task 0060 risk policy;
- change-aware diff scanner;
- hard-fail secret/injection/raw-SQL/TLS/process/destructive-migration rules;
- independent-review validation using GitHub PR review evidence;
- exact-path, expiring, Accepted-ADR-backed destructive-migration exceptions;
- one-time bounded bootstrap rule for installing the gate itself;
- unit/negative tests;
- dedicated pull-request/review workflow;
- mandatory architecture-quality-gate integration;
- ADR, operations documentation, roadmap, and PROJECT_RULES update.

## Explicitly out of scope

No hospital/doctor/lab feature is added. No production database schema changes are made. No runtime service, external SAST vendor, secret manager, clinical AI model, diagnosis/prescribing automation, or production deployment is introduced.

## Completion criteria

- policy validation fails closed on drift;
- unsafe raw SQL and configured secret/runtime-execution patterns fail;
- destructive migration SQL fails without a narrow Accepted-ADR-backed exception;
- transaction/tenant guard removal becomes a high-risk review signal;
- high-risk production paths require approval from a reviewer other than the PR author;
- a later changes-requested review supersedes that reviewer's earlier approval;
- gate-integrity files are themselves review-protected after bootstrap;
- bootstrap applies only to the exact Task 0060 base, allowlist, and expiry;
- focused tests pass;
- `pnpm format:check`, `pnpm lint`, `pnpm test`, and `pnpm build` pass on exact PR head;
- dedicated Task 0060 workflow passes;
- PR is merged before feature work proceeds under the new governance rule.
