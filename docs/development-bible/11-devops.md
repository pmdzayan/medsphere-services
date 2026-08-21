# Volume 11 — Local Development (Clean-Machine Bootstrap)

**Scope:** the minimum supported V1 localhost path -- clone through a
running backend, frontend, and passing health check. This document
supersedes ad hoc instructions elsewhere for local bootstrap specifically;
`README.md`'s "Local quality checks" section still governs the PR/CI
quality gates.

**Supported backend for V1:** `apps/auth-service` only. The repository
still contains several other NestJS applications
(`api-gateway`, `billing-service`, `inventory-service`, `notification-service`,
`reservation-service`, `search-service`) -- these are unaccepted prototype
scaffolds, gated behind Docker Compose's `unaccepted-prototypes` profile and
the `ENABLE_UNACCEPTED_PROTOTYPE_SERVICES` flag. A new developer following
this guide never needs to start them. Do not run the root `pnpm dev`
command expecting only the supported stack -- it runs every app in the
monorepo (via `turbo run dev`) and most of them are not part of the
accepted V1 path. Use `pnpm dev:app` instead (below), which starts exactly
`auth-service` and `web`.

## Prerequisites

- **Node.js:** `^20.19.0 || >=22.12.0` (see root `package.json`
  `engines.node`)
- **PNPM:** exactly `9.15.0` (`corepack enable && corepack prepare
pnpm@9.15.0 --activate` if you don't already have it)
- **Docker** (Desktop, or Engine + the Compose plugin): required for
  PostgreSQL and Redis. There is currently no supported non-Docker way to
  run these locally.

## 1. Install dependencies

```bash
pnpm install --frozen-lockfile
```

This also runs `postinstall` (`prisma generate` for `@medsphere/database`),
which requires network access to fetch Prisma's query-engine binaries. If
this step fails in a network-restricted environment, dependent Prisma
client generation and any Postgres-backed step below will not work until
that network access is available.

## 2. Configure `.env`

```bash
cp .env.example .env
```

Fill in:

- `POSTGRES_PASSWORD` -- any local value; not used outside your machine.
- `REDIS_PASSWORD` -- same.
- `AUTH_JWT_PRIVATE_KEY_BASE64`, `AUTH_JWT_PUBLIC_KEY_BASE64`,
  `AUTH_REFRESH_TOKEN_PEPPER` -- generate fresh development-only values
  with:

  ```bash
  pnpm dev:keys
  ```

  This prints three `.env`-ready lines (an RSA key pair and a refresh
  pepper) using only Node's built-in `crypto` module. Paste them into your
  `.env`, replacing the corresponding blank lines. Never commit `.env` or
  reuse these values anywhere but your own machine -- `.env` is already
  git-ignored.

Leave `ENABLE_UNACCEPTED_PROTOTYPE_SERVICES=false` and
`NOTIFICATION_EMAIL_PROVIDER_ENABLED` unset/absent unless you specifically
need them; both are deny-by-default and the supported path does not
require either. Local SMTP/email delivery stays disabled unless you
explicitly configure `NOTIFICATION_EMAIL_PROVIDER_*` variables (see
`apps/auth-service/src/notifications/notification-provider-registry.factory.ts`) --
this is intentional and must not be worked around.

Also copy the frontend's own example file:

```bash
cp apps/web/.env.example apps/web/.env
```

`AUTH_API_URL` there already defaults to `http://localhost:3000`, matching
`auth-service`'s default port -- no change needed unless you intentionally
run the backend on a different port.

## 3. Start infrastructure (PostgreSQL + Redis)

```bash
pnpm dev:infra
```

This creates the two external Docker networks the compose files expect
(`medsphere-infra-network`, `medsphere-apps-network`) if they don't already
exist, then starts PostgreSQL 16 and Redis 7 via
`compose/docker-compose.database.yml`. Both are idempotent -- safe to run
again if infrastructure is already up.

Historically, only PostgreSQL had a compose service; Redis (required by
`auth-service` -- `REDIS_CLUSTER_URL` fails closed if unset) had no
compose-managed way to start at all. This has been fixed in
`compose/docker-compose.database.yml`, which now also attaches both
services to the same external network
`compose/docker-compose.services.yml` already expected but nothing
previously created.

To stop infrastructure: `pnpm dev:infra:down`.

## 4. Generate the Prisma client and verify migrations

```bash
pnpm --filter @medsphere/database prisma:generate
pnpm db:verify
```

`db:verify` validates the Prisma schema, deploys every migration, checks
migration status, and fails if the deployed database drifts from the
declared schema. Never substitute `prisma db push` for this -- it is not
migration-tracked and is explicitly disallowed for this repository.

## 5. Start the backend and frontend

```bash
pnpm dev:app
```

This starts exactly `auth-service` (port `3000`) and `web` (port `3001`,
via `next dev -p 3001` -- previously both defaulted to port 3000, which
would silently collide if started together). Equivalent to running both of
the following in separate terminals:

```bash
pnpm --filter @medsphere/auth-service dev
pnpm --filter @medsphere/web dev
```

## 6. Open localhost

- Frontend: <http://localhost:3001>
- Backend health: <http://localhost:3000/health/live>
- Backend API docs (only if `ENABLE_SWAGGER=true`):
  <http://localhost:3000/api>

## 7. Verify with a smoke check

```bash
pnpm dev:check
```

Confirms both `http://localhost:3000/health/live` and
`http://localhost:3001/` respond. Exits non-zero and prints which service
did not respond if either is down.

## Common failure cases

| Symptom                                                 | Cause                                                                                                | Fix                                                                                              |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `AUTH_JWT_PRIVATE_KEY_BASE64 is required`               | `.env` key material blank                                                                            | `pnpm dev:keys` and paste the output into `.env`                                                 |
| `Redis connection refused` / auth-service fails to boot | Redis not running, or `REDIS_CLUSTER_URL` still points at hostname `redis` while running on the host | `pnpm dev:infra`; confirm `.env`'s `REDIS_CLUSTER_URL` uses `localhost`, matching `.env.example` |
| `network medsphere-infra-network not found`             | Docker network never created                                                                         | `pnpm dev:infra` creates it automatically; or run `bash scripts/dev-network-setup.sh` directly   |
| Frontend can't reach the backend                        | Backend and frontend both landed on port 3000                                                        | Use `pnpm dev:app` (sets the frontend to port 3001) rather than starting each ad hoc             |
| `pnpm dev` starts 7+ unfamiliar services                | Root `pnpm dev` runs every app in the monorepo, not just the supported V1 stack                      | Use `pnpm dev:app` instead                                                                       |
| Prisma engine fetch fails during `pnpm install`         | No network access to Prisma's binary host                                                            | Requires network access to that host; this is an environment prerequisite, not a code defect     |

## Shutdown / reset

```bash
# Stop the backend/frontend dev processes: Ctrl+C in their terminals.
pnpm dev:infra:down          # stop Postgres + Redis containers
docker volume rm medsphere-database_medsphere-postgres-data  # optional: wipe local DB data
```

## What this guide intentionally does not cover

- The other NestJS applications under `apps/` (see "Supported backend for
  V1" above) -- they remain reachable only via
  `docker compose --profile unaccepted-prototypes ...` for developers who
  specifically need them, and are out of scope for the supported V1
  localhost path.
- Kafka (`KAFKA_BROKERS`) -- referenced in configuration but not required
  by the supported V1 path.
- Production deployment, secrets management, and release infrastructure --
  see `PROJECT_STATUS.md`; production delivery remains intentionally
  disabled.
