# ADR-007: Trusted Provider Access Scope

**Status:** Accepted

**Date:** 2026-08-02

**Decision owners:** MedSphere Project Owner and CTO

**Depends on:** ADR-001, ADR-003, ADR-004, ADR-005

## Context

The accepted access token proves a user, tenant membership, tenant, and live
session. It does not prove which provider locations that membership may operate.
Inventory commands currently accept a `providerId`, but ADR-005 explicitly says
that a client-supplied provider identifier is not authority. Mounting inventory
routes without a server-side provider assignment would therefore turn every
inventory permission into tenant-wide access and could expose or mutate another
hospital or pharmacy location inside the same tenant.

## Decision

- Add `MembershipProviderAccess` as the migration-owned link between one active
  tenant membership and one provider in the same tenant.
- Enforce both tenant equalities with composite foreign keys. A request header,
  body, query, or path parameter never creates provider authority.
- Backfill existing active tenant administrators to every existing active
  provider in their tenant so the accepted baseline remains operable.
- Add separate migration-owned permissions for reading and managing provider
  assignments and reading inventory stock.
- Provider-assignment mutations run in a serializable transaction and write
  append-only tenant audit evidence in that same transaction.
- The first accepted inventory route is read-only. It requires both
  `inventory.stock.read` and a live provider assignment for the authenticated
  membership. Missing access returns the same not-found boundary as a missing
  provider to avoid cross-provider enumeration.
- The current authentication application remains the temporary primary modular
  monolith composition root. This does not approve the inventory-service as a
  separate production microservice.

## Alternatives rejected

### Trust `providerId` from the client

Rejected. Authentication proves tenant membership, not provider ownership.

### Give every tenant member access to every provider

Rejected. A tenant may contain several locations and staff scopes.

### Put provider identifiers into long-lived access tokens

Rejected. Assignments can change while a token is valid and large provider sets
do not belong in JWT claims. Provider access is resolved server-side per request.

## Consequences

- Inventory HTTP work gains a deny-by-default provider boundary.
- Provider assignment becomes an explicit administrative workflow with audit
  evidence.
- Existing administrators retain access through deterministic migration
  backfill.
- Provider creation must assign its initiating administrator in the same future
  transaction before provider onboarding can be accepted.
- This decision does not complete Gate 3 mutations or any later gate.

## Review triggers

Review when provider groups, facility-level roles, delegated administration, or
cross-tenant network access is designed.
