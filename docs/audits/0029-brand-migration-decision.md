# Task 0029 persisted-brand migration decision

## Decision

Retain `20260830190000_aim_consumer_brand` as a narrowly scoped data migration.

The reserved personal-account tenant's persisted `name` is returned through authenticated
identity/session responses and is rendered as the active tenant name. New installations receive
`All In Medico Personal Accounts` from the central brand configuration, but central configuration
alone cannot update existing rows. Removing the migration would therefore leave existing accounts
showing the former consumer brand. Presentation-time slug mapping was rejected because it would
duplicate branding logic across identity boundaries while leaving the persisted display value stale.

The migration changes only the `name` and `updatedAt` columns when both of these exact predicates
match:

- stable slug: `medsphere-personal-accounts`;
- legacy display name: `MedSphere Personal Accounts`.

It deliberately preserves the stable slug, tenant ID, organization type, memberships, users,
authentication identities, and all tenant authority relationships.

## Verification

`pnpm --filter @medsphere/database prisma:verify-0029-brand` builds an isolated database from the
accepted pre-0029 Prisma migration history, seeds a populated identity graph and control tenants,
then deploys the actual Task 0029 migration. Its PostgreSQL assertions prove:

- the exact reserved legacy name changes to `All In Medico Personal Accounts`;
- an ordinary organization with the same name is untouched;
- a similarly named organization and a custom-named organization are untouched;
- unrelated tenant timestamps and row counts are unchanged;
- tenant IDs, slugs, organization types, versions, memberships, users, and external-auth links are
  unchanged;
- replaying the migration SQL is deterministic and makes no second update;
- Prisma reports the isolated migration history as fully applied.
