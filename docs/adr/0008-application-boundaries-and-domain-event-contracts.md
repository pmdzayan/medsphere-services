# ADR-008: Application Boundaries and Domain Event Contracts

**Status:** Accepted

**Date:** 2026-08-08

**Decision owners:** MedSphere Project Owner and CTO

**Depends on:** ADR-001, ADR-004, ADR-006

## Context

Version 1 is a modular monolith, but the repository still contains several
historical application folders. Without automated enforcement, an application
can import another application's private source and turn temporary layout into
an accidental runtime boundary. The recovered AG-01 work correctly identified
this risk, but its shared authentication and audit implementations conflict with
the newer accepted code and include unsafe authorization behavior.

Future asynchronous work also needs a transport-neutral event shape. Putting a
publisher, logger, broker, or database implementation into the shared types
package would create hidden infrastructure ownership before the outbox design is
accepted.

## Decision

- Applications may import their own source and public entry points from
  @medsphere packages.
- Applications may not import another application's source.
- Consumers may not deep-import package source trees; package entry points
  define the public contract.
- A TypeScript-AST architecture check covers static imports, re-exports,
  CommonJS require calls, dynamic imports, and import types. ESLint adds an
  immediate editor-level restriction.
- @medsphere/types owns only framework-independent domain-event interfaces.
- @medsphere/database remains the accepted durable audit and transaction
  infrastructure owner. This ADR does not move or duplicate its implementation.
- No event publisher, broker client, retry loop, logging side effect, outbox, or
  delivery worker is accepted by this decision.

## Reason

Automated boundaries prevent cross-application shortcuts from undermining the
modular-monolith migration. A small event contract provides a stable vocabulary
for later domain work without prematurely selecting transport or delivery
semantics.

## Alternatives

- **Rely on code review:** rejected because multiline, dynamic, and indirect
  imports are easy to miss repeatedly.
- **Copy recovered common auth/audit code:** rejected because it duplicates the
  accepted owner and weakens authorization and audit validation.
- **Adopt an event bus now:** rejected because no accepted outbox, delivery, or
  operational contract exists.

## Consequences

- Boundary violations fail deterministically in local and CI validation.
- Shared package entry points must remain deliberate and reviewed.
- Later event infrastructure can consume the contract but must receive its own
  ADR, threat model, persistence design, and delivery tests.
- Existing historical applications remain migration inputs, not approved
  independently deployable services.

## Implementation constraints

1. The architecture check itself has fixture coverage for every supported import
   form and false-positive coverage for comments and ordinary strings.
2. Event actors use only TENANT_USER, PLATFORM_USER, and tenant-scoped SYSTEM;
   SERVICE is not a database actor type.
3. Payload types remain generic. Contracts never log or publish by themselves.
4. This work does not modify permissions, authentication behavior, migrations,
   inventory, reservations, or application mounting.

## Review triggers

Review when application folders are consolidated, path aliases are introduced,
an outbox/event bus is designed, or a module is approved for service extraction.
