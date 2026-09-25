# Task 0058 — Architecture & Bottleneck Governance

**Version:** V2 cross-cutting engineering  
**Branch:** `cto/0058-architecture-bottleneck-governance`  
**Base:** `feature/database-architecture`

## Objective

Make "measure before adding scaling complexity" an enforceable AIM engineering
rule while reusing the accepted runtime, performance, observability, and ADR
infrastructure.

## In scope

- machine-readable bottleneck/scaling policy;
- static production-surface complexity gate;
- binding of the governance baseline to the existing performance certification;
- Accepted ADR requirement for future scaling exceptions;
- tests proving prototype exclusions do not grant production authority;
- PROJECT_RULES and operational documentation;
- Quality Gate integration through `test:architecture`.

## Explicitly out of scope

No Kafka activation, new queue, new datastore, search cluster, sharding,
read-replica topology, service mesh, autoscaling, microservice extraction, CDN,
or production capacity claim is introduced by this task.

## Completion criteria

- existing repository passes the governance scanner with zero unjustified
  production scaling primitives;
- tests prove unapproved primitives fail closed;
- tests prove a proposed/unaccepted ADR cannot authorize an exception;
- performance baseline drift fails closed;
- `pnpm format:check`, `pnpm lint`, `pnpm test`, and `pnpm build` pass;
- exact-head PR workflows pass and the task is merged before Task 0059 starts.
