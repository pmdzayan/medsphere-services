# Candidate Task 0032 — standalone test harness

**Pre-0031 candidate work. Not an accepted test suite.**

These two scripts are not run by `pnpm test` (they are not Jest specs).
They exist because the corresponding evidence could not be captured
inside this repository's normal Jest run in the sandbox this candidate
was built in, and the correction-pass review requires every test
needed to reproduce the candidate's claimed evidence to actually be
present in the patch.

## `verify-real-audit-metadata-validator.ts`

Proves, using the REAL, unmodified `validateAuditMetadata` from
`packages/database/src/audit.ts` (imported via a direct relative path,
not the `@medsphere/database` package alias) that:

- the exact metadata shape `PatientProfileService.updateOwnProfile`
  produces (`{ fieldsChanged: '<sorted,comma,joined,names>' }`) is
  genuinely accepted;
- the prior, buggy array-valued design (`{ fieldsChanged: [...] }`) is
  genuinely rejected;
- a raw field value smuggled under an unexpected key is rejected.

Run with:

```
cd apps/auth-service
npx ts-node --transpile-only --compiler-options '{"module":"commonjs","moduleResolution":"node"}' test/candidate-0032/verify-real-audit-metadata-validator.ts
```

The relative import deliberately bypasses `@medsphere/database`'s
`index.ts`, which also re-exports `./client` (a module that
instantiates a real `PrismaClient` at import time). In this sandbox,
the generated Prisma client is unavailable (`prisma generate` cannot
reach `binaries.prisma.sh`), so any import through the package barrel
fails at load time -- this is why `PatientProfileService`'s own Jest
spec cannot execute here either. `validateAuditMetadata` itself has no
Prisma dependency, so importing it directly lets this specific
regression actually run.

## `identity-isolation.pg-test.js`

Requires a real local PostgreSQL instance. Not a Jest spec -- a plain
Node script using the `pg` driver directly, mirroring
`PatientProfileService`'s exact query and transaction shape (see the
inline comments in the file for the precise mapping).

Proves, against a real database:

- self-read is correctly scoped by `identity.userId`;
- an update scoped to one user's `identity.userId` never touches a
  second user's row;
- a non-existent `identity.userId` returns null, never another row;
- **the mandatory correction-pass-1 requirement**: a forced audit-write
  failure (a real Postgres `CHECK` constraint violation, not a
  simulated error) rolls back the entire transaction -- the profile
  mutation genuinely reverts, proven by re-reading the row afterward,
  not merely asserted;
- a successful update commits both the profile row and its audit event
  together.

### Setup

```
cd apps/auth-service/test/candidate-0032
npm install
```

Then, against a Postgres instance reachable at `localhost:5432` with a
`postgres`/`postgres` superuser (adjust `CONN` in the script for a
different environment):

```sql
CREATE DATABASE aim_candidate_0032;
```

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE TABLE "User" (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  "firstName" TEXT NOT NULL,
  "lastName" TEXT NOT NULL,
  phone TEXT,
  "phoneVerifiedAt" TIMESTAMP,
  "preferredLanguage" TEXT NOT NULL DEFAULT 'en',
  "deletedAt" TIMESTAMP,
  PRIMARY KEY (id)
);
INSERT INTO "User" (id, email, "firstName", "lastName", phone) VALUES
  ('11111111-1111-4111-8111-111111111111', 'asha@example.com', 'Asha', 'Rao', '+911111111111'),
  ('22222222-2222-4222-8222-222222222222', 'bala@example.com', 'Bala', 'Krishnan', '+922222222222');

CREATE TYPE "AuditScope" AS ENUM ('TENANT', 'PLATFORM');
CREATE TYPE "AuditActorType" AS ENUM ('TENANT_USER', 'PLATFORM_USER', 'SYSTEM');
CREATE TABLE "AuditEvent" (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  scope "AuditScope" NOT NULL,
  "actorType" "AuditActorType" NOT NULL,
  outcome TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "tenantId" UUID,
  "actorMembershipId" UUID,
  "platformActorUserId" UUID,
  metadata JSONB,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  CONSTRAINT "AuditEvent_event_type_check" CHECK ("eventType" IN ('patient.profile.updated'))
);
```

Then:

```
node identity-isolation.pg-test.js
```

This minimal schema is a hand-built approximation of the two accepted
models this candidate touches (`User`, `AuditEvent`), not a copy of any
real migration -- it exists purely so this script's claims are
independently reproducible without depending on the full, currently
Prisma-CLI-blocked migration chain in this sandbox.

## Post-0031 note

Once Tasks 0019–0031 land and the sandbox/CI Prisma-client-generation
limitation is resolved (or this candidate is reconciled in an
environment where it is), these scripts should be replaced by real
Jest specs (`patient-profile.service.spec.ts` already contains the
Jest-shaped versions of the same assertions) and real PostgreSQL-backed
integration tests using the actual migration chain, not this hand-built
approximation.
