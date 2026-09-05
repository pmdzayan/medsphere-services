# ADR-025 — Secure organization onboarding and slug-free login

## Status

Accepted — implemented by Task 0010 and merged in commit `87f79e3` (#126).

## Context

Public registration previously required an internal tenant slug. That leaks an implementation locator, cannot prove an organization relationship, and produces a poor login flow for people with multiple memberships. Personal accounts also need to coexist with the mandatory membership-derived tenant boundary without gaining healthcare-organization authority.

## Decision

- Healthcare-organization registration requires a reusable, revocable administrator-issued join code plus a matching bounded organization type.
- Only an HMAC-SHA256 digest keyed by `ORG_JOIN_CODE_PEPPER` is stored. Plaintext is returned once at issuance and is never logged or persisted.
- Join-code issuance, metadata listing, and revocation are tenant-scoped, guarded by `organization.join-codes.manage`, granted by migration to the system tenant-administrator role, and durably audited.
- A valid code creates only a `PENDING` role-less membership. It never activates an account or assigns privileges.
- Personal registration uses one reserved `NONE` tenant with an active, role-less membership. All legacy tenants migrate to `UNSPECIFIED`, never `NONE`, and the reserved tenant is validated fail-closed.
- Password and Google login first verify the global identity and then derive active organization choices from memberships. Session issuance remains bound to one selected membership and tenant. Organization display metadata is returned without requiring a slug. A Google organization selection re-verifies the signed provider identity before resolving a membership scoped to that user.
- Phone OTP accepts the legacy slug when supplied, but new onboarding may omit it. Slug-free resolution succeeds only for exactly one eligible membership and fails closed on ambiguity.

## Consequences

The shared personal tenant is an authentication/authorization compatibility boundary only. Tenant-wide patient-data access must never be inferred from membership in it; future personal health data requires a subject-scoped authorization model. Reusable codes need operator revocation and online rate limiting; compromise of a code does not grant roles or activation. Existing tenants require explicit operator classification before organization-type onboarding is enabled.

## Rejected alternatives

- Client-supplied tenant slug as proof of affiliation: not proof and leaks an internal locator.
- Plaintext or reversible stored codes: creates recoverable credentials in a database compromise.
- Automatic role assignment or membership activation: violates deny-by-default RBAC and verification policy.
- Migrating existing tenants to `NONE`: incorrectly classifies healthcare organizations as personal accounts.
- Per-user personal tenants in this sprint: substantially expands lifecycle and data-ownership semantics; deferred until subject-scoped personal data exists.
