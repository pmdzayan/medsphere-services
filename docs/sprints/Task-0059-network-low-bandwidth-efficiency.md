# Task 0059 — Network & Low-Bandwidth Efficiency

**Version:** V2 cross-cutting engineering  
**Branch:** `cto/0059-network-low-bandwidth-efficiency`  
**Base:** `feature/database-architecture`

## Objective

Make AIM measurably efficient on constrained mobile connections without weakening freshness, privacy, authorization or Task 0048's static-only PWA cache boundary.

## In scope

- explicit production Next compression;
- bounded cache headers for manifest/icon assets;
- forced revalidation of service-worker code;
- machine-readable public-route transfer/request/readiness budgets;
- static fail-closed checks for unsafe shared API caching;
- real Chromium constrained-mobile certification;
- third-party browser-origin detection;
- Quality Gate integration and dedicated network certification workflow;
- ADR/runbook/project-rule updates.

## Explicitly out of scope

No CDN, service mesh, new cache service, healthcare-response shared cache, persistent offline record store, native-app transport, backend protocol rewrite or Task 0060 implementation.

## Completion criteria

- fast Task 0059 boundary tests pass;
- current BFF routes contain zero forbidden shared-cache markers;
- selected public routes pass compression, transfer, request, mobile layout and constrained-network budgets;
- public manifest/icon headers and service-worker update headers are certified at runtime;
- no selected public route makes an unexpected third-party browser request;
- normal `pnpm format:check`, `pnpm lint`, `pnpm test` and `pnpm build` pass;
- exact-head PR certification matrix, including the new network workflow, is green;
- branch is zero behind the authoritative base before merge;
- post-merge authoritative workflows are green before Task 0059 is closed.
