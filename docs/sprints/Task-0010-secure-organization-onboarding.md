# Task 0010 — Secure organization onboarding

## Objective

Replace public tenant-slug onboarding with organization-type selection and cryptographically protected join codes, while supporting personal accounts and slug-free multi-organization login without weakening membership-derived tenant authority.

## Deliverables

- bounded organization types with fail-closed legacy value `UNSPECIFIED`;
- hashed, expiring, reusable, revocable join-code persistence with database invariants;
- tenant-admin issue/list/revoke API with one-time plaintext display, optimistic concurrency, tenant-safe creator attribution, and audit events;
- password and Google registration using organization type and code;
- personal-account path with no healthcare roles or permissions;
- slug-free identify/select-organization login and valid sealed web sessions;
- slug-free, unambiguous phone-OTP resolution for newly registered accounts;
- public-endpoint rate limits, non-enumerating responses, tests, migration, and ADR-025.

## Acceptance criteria

- Existing tenants are not classified as personal accounts by migration.
- Invalid, expired, revoked, wrong-type, or unknown codes produce the same public registration response and no membership.
- A valid organization code creates only a pending, role-less membership.
- Join-code plaintext is never stored; hashes and counters satisfy database checks.
- Only a membership with `organization.join-codes.manage` in the active tenant can manage codes.
- A selected login membership is scoped to the password-verified user and produces a membership-bound session.
- Slug-free sessions remain readable by the web BFF and show server-derived organization metadata.
- OTP without a slug resolves only one eligible membership; ambiguity fails closed.
- Required lint, test, build, migration, drift, upgrade, and dependency-audit checks pass before merge.

## Status

Implementation complete locally; acceptance remains pending exact-head CI and merge.
