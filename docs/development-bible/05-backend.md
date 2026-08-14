# Volume 05 — Backend Bible: Identity, Authorization, Audit, and Inventory

**Sprints:** Accepted through G3.21; G3.22 inventory event producers candidate

**Decisions:** ADR-003 through ADR-013; proposed ADR-014

**Status:** G3.21 accepted; G3.22 exact-head CI and CTO acceptance required; not production-approved

## Purpose and boundary

The authentication module establishes a trusted global user, tenant membership,
tenant, and session context. The authorization module derives permissions from
that exact active membership on every request. The audit module records bounded,
attributable, append-only evidence for accepted authorization and session
events.

The active authentication application is the temporary modular-monolith
composition root. It mounts health, authentication, self-user settings,
authorization administration, tenant audit reads, provider-access management,
and accepted inventory routes. Prototype provider/product CRUD, reservation,
medical-record, marketplace, delivery, payment, and controlled-medicine APIs
remain unmounted.

## Mounted route contract

| Method | Route                                                                      | Access                             | Authoritative context                        |
| ------ | -------------------------------------------------------------------------- | ---------------------------------- | -------------------------------------------- |
| POST   | `/auth/register`                                                           | Public/limited                     | Normalized tenant slug plus tenant policy    |
| POST   | `/auth/login`                                                              | Public/limited                     | Active user-membership-tenant database chain |
| POST   | `/auth/refresh`                                                            | Public/limited                     | Stored session membership                    |
| POST   | `/auth/logout`                                                             | Authenticated                      | Verified request identity                    |
| POST   | `/auth/logout-all`                                                         | Authenticated                      | Verified global user                         |
| GET    | `/users/me/privacy`                                                        | Authenticated                      | Verified request identity user               |
| PATCH  | `/users/me/privacy`                                                        | Authenticated                      | Verified request identity user               |
| PATCH  | `/users/me/language`                                                       | Authenticated                      | Verified request identity user               |
| GET    | `/authorization/permissions`                                               | Permission guarded                 | Global migration-owned catalogue             |
| GET    | `/authorization/roles`                                                     | Permission guarded                 | Verified request tenant                      |
| POST   | `/authorization/roles`                                                     | Permission guarded                 | Verified request tenant                      |
| GET    | `/authorization/roles/:roleId`                                             | Permission guarded                 | Verified request tenant                      |
| PATCH  | `/authorization/roles/:roleId`                                             | Permission + `If-Match`            | Verified request tenant                      |
| DELETE | `/authorization/roles/:roleId`                                             | Permission + `If-Match`            | Verified request tenant                      |
| GET    | `/authorization/memberships/:membershipId/roles`                           | Permission guarded                 | Verified request tenant                      |
| PUT    | `/authorization/memberships/:membershipId/roles/:roleId`                   | Permission guarded                 | Verified request tenant                      |
| DELETE | `/authorization/memberships/:membershipId/roles/:roleId`                   | Permission guarded                 | Verified request tenant                      |
| GET    | `/audit/events`                                                            | `audit.events.read`                | Verified request tenant only                 |
| GET    | `/audit/events/:eventId`                                                   | `audit.events.read`                | Verified request tenant only                 |
| GET    | `/authorization/memberships/:membershipId/provider-access`                 | Permission guarded                 | Verified request tenant                      |
| PUT    | `/authorization/memberships/:membershipId/provider-access/:providerId`     | Permission guarded                 | Verified request tenant                      |
| DELETE | `/authorization/memberships/:membershipId/provider-access/:providerId`     | Permission guarded                 | Verified request tenant                      |
| GET    | `/inventory/providers/:providerId/stock`                                   | Read permission + assignment       | Verified membership/provider relation        |
| PUT    | `/inventory/providers/:providerId/products/:productId`                     | Manage permission + assignment     | Verified membership/provider relation        |
| POST   | `/inventory/providers/:providerId/products/:productId/batches`             | Receipt permission + assignment    | Verified membership/provider relation        |
| POST   | `/inventory/providers/:providerId/batches/:batchId/adjustments`            | Adjust permission + assignment     | Verified membership/provider relation        |
| GET    | `/inventory/providers/:providerId/reservations`                            | Read permission + assignment       | Verified membership/provider relation        |
| GET    | `/inventory/providers/:providerId/reservations/:reservationId`             | Read permission + assignment       | Verified membership/provider relation        |
| POST   | `/inventory/providers/:providerId/reservations/:reservationId/transitions` | Manage permission + assignment     | Verified membership/provider relation        |
| POST   | `/inventory/providers/:providerId/reservations`                            | Create permission + assignment     | Verified membership/provider relation        |
| POST   | `/inventory/providers/:providerId/batches/:batchId/quarantine`             | Quarantine permission + assignment | Verified membership/provider relation        |

No accepted endpoint takes an authoritative user, membership, tenant, or session ID from the request body, path, query, or custom header.

The three G3.2 write routes are accepted. G3.3 reservation routes are mounted
candidates; they do not become accepted production boundaries until exact-commit
PostgreSQL CI and review pass.

## Components

- `AuthConfigService`: fail-fast key, token, session, pepper, and Argon2 configuration.
- `PasswordService`: explicit Argon2id hashing, rehash detection, and dummy verification for unknown identities.
- `TokenService`: minimal RS256 access JWTs and opaque 256-bit refresh credentials.
- `UsersRepository`: global identity, tenant-membership login lookup, and policy-controlled pending registration.
- `SessionRepository`: active-chain validation, serializable rotation, replay-family compromise, and self-scoped revocation.
- `JwtStrategy`: strict issuer, audience, algorithm, token type, key ID, claim, and live database-chain validation.
- `JwtAuthGuard`: global deny-by-default route enforcement with shared public metadata.
- `AuthSecurityEventService`: allowlisted non-credential event seam for S0.4 durable audit integration.
- `RedisThrottlerStorage`: shared fixed-window counters for network-source and account/session throttles.
- `AuthorizationRepository`: tenant-bound role, catalogue, assignment, and
  current-permission queries.
- `AuthorizationService`: serializable role/assignment orchestration,
  optimistic versions, immutable built-in policy, and last-administrator
  protection.
- `PermissionsGuard`: deny-by-default permission enforcement with durable
  denial evidence.
- `AuditWriter`: typed event construction, event-specific metadata allowlists,
  request correlation, and tenant/platform actor scoping.
- `AuditRepository` and `AuditService`: field-minimized, cursor-based tenant
  reads that cannot return platform evidence.
- `InventoryService`: assigned-provider batch-derived stock reads.
- `InventoryCommandService`: serializable, idempotent, version-aware listing,
  receipt, and adjustment orchestration with atomic ledger and audit writes.
- `ReservationService`: assigned-provider operational reads that omit patient
  identity and free-text notes.
- `ReservationLifecycleService`: serializable, versioned staff transitions with
  authorization-before-replay, exact hold/stock updates, and atomic audit.
- `ReservationCreationService`: serializable assigned-provider staff creation
  with authorization-before-replay, same-tenant subject checks, deterministic
  FEFO holds, optimistic batch predicates, and atomic audit.
- `BatchExpiryService`: bounded non-HTTP reconciliation using database time,
  stable due-batch selection, full reservation-release reuse, per-candidate
  serializable transactions, immutable expiry evidence, and tenant-system audit.
- `InventoryQuarantineService`: assigned-provider, serializable one-way batch
  quarantine with authorization-before-replay, shared reservation release,
  immutable evidence, and atomic tenant-user/system audit.

Repositories own persistence queries; controllers do not access Prisma. Services own orchestration and security state transitions. DTOs own transport validation and normalization. The access identity is readonly and contains `userId`, `membershipId`, `tenantId`, `sessionId`, and the verified token ID.

Role and assignment mutations write their required audit event inside the same
serializable transaction. Session creation, rotation, replay response, logout,
and logout-all use the same rule. Permission denial has no protected mutation,
so its audit row is written before the guard returns forbidden.

## Authorization rules

- The client never submits an authoritative tenant identifier.
- Roles belong to one tenant; assignments belong to `TenantMembership`.
- Permission keys are compile-time constants backed by migration-owned rows.
  Wildcards and arbitrary tenant capabilities are rejected.
- `TENANT_ADMINISTRATOR` is the only built-in role. Tenant APIs cannot rename,
  delete, or replace its permissions.
- Custom role update/delete requires a strong positive numeric `If-Match`
  validator. Weak, missing, malformed, unsafe, and stale values fail.
- Concurrent assignment `PUT` is idempotent. Concurrent last-administrator
  removal is serialized through the tenant version and preserves one active
  administrator.
- Soft-deleted roles, inactive memberships, inactive tenants, absent policy
  metadata, and persistence errors never authorize.

## Durable audit contract

The accepted S0.4 vocabulary is:

- role created, updated, and deleted;
- assignment added and removed;
- permission denied;
- session created;
- refresh succeeded, failed, and replayed;
- current-session logout succeeded;
- global logout-all succeeded.

Metadata is an event-specific object of bounded scalar values. Passwords,
credentials, tokens, secrets, authorization headers, contact details, clinical
content, payloads, bodies, old/new snapshots, and arbitrary keys are rejected.
The application limit is 12 KiB and the database limit is 16 KiB. Tenant API
responses expose only the documented event fields and revalidate persisted
metadata before returning it.

## Validation and API documentation

- The shared validation pipe strips no unknown fields silently: it rejects them.
- Production bootstrap and HTTP-boundary tests call the same
  `configureAuthApplication` function so global filters, validation, and
  opt-in OpenAPI behavior cannot drift between runtime and test setup.
- Every HTTP application installs shared security headers before routes.
- Validation messages remain bounded strings, unsafe request IDs are dropped,
  and server-side failure details are never returned.
- Tenant slugs and email locators are trimmed and lowercased; passwords are never transformed.
- Passwords allow Unicode and passphrases, with 15–128 character bounds while MFA is unavailable.
- All external strings are bounded.
- Accepted authentication DTOs and responses carry OpenAPI metadata.
- Swagger UI/JSON is opt-in with `ENABLE_SWAGGER=true` and should remain disabled on public production edges.

## Rate-limit policy

Redis-backed counters apply across instances. Health checks are excluded; other routes retain a broad baseline. Authentication routes override it:

| Route    | Network source   | Account/session locator |
| -------- | ---------------- | ----------------------- |
| Register | 5 per 15 minutes | 3 per 15 minutes        |
| Login    | 10 per minute    | 5 per minute            |
| Refresh  | 30 per minute    | 10 per minute           |

Generated storage keys contain route-scoped, domain-separated HMAC digests rather than raw emails, IP addresses, user IDs, passwords, refresh credentials, or authorization headers. Redis failure prevents the service from starting or authorizing an unmetered request.

NestJS 11 supplies limit, window, block duration, and throttler name to the
storage. Redis server time and one atomic script own counter and block state.

Account rate-limit tracking canonicalizes tenant slugs and email addresses
with the same trim-and-lowercase rule as the authentication DTOs. This is
required because guards execute before DTO transformation; raw casing or
whitespace must not create additional throttle buckets for the same account.

## HTTP boundary verification

The application-level security suite boots the real `AppModule`, global
guards, Passport strategy, validation pipe, and exception filter over an
ephemeral HTTP listener. Persistence and Redis adapters are replaced with
deterministic test doubles because their real behavior is verified separately
by the PostgreSQL and Redis integration suites.

The suite proves that public health and all five language options remain
available; protected routes fail with the shared 401 envelope; HS256
substitution is rejected before identity lookup; forged identity headers cannot
replace the signed and server-validated context; revoked session chains
invalidate an otherwise valid access token; permission denials return 403 only
after durable evidence; strong role preconditions are enforced; tenant audit
reads use trusted identity; and every unaccepted prototype route returns 404.

## Error and logging rules

- Login always returns `Invalid credentials` for unknown user, tenant, membership, status, or password.
- Registration always returns the same accepted response and never attaches an existing global identity publicly.
- Refresh errors do not distinguish missing, expired, revoked, or replayed credentials to the caller.
- Logs and event payloads must never contain passwords, access tokens, refresh credentials, token digests, keys, email addresses, authorization headers, or credential request bodies.
- Authentication operational logs remain separate from S0.4 durable audit
  events. Neither channel may contain credentials or private payloads.

## Future extension seams

Later reviewed work may add invitation/administrator bootstrap, email
verification, password recovery, MFA/passkeys, device management, external
identity providers, authorization caching, delegated policy, audit
partitioning/export, and a measured revocation cache. None may weaken
membership-derived tenant context, bypass session revocation, or mutate
historical audit evidence.

## S0.5 inventory and medicine reservation target

**Status:** Architecture accepted under ADR-005; implementation not yet accepted

The Inventory bounded context will own provider-product configuration, batches,
stock movements, availability, FEFO, medicine reservations, items, and exact
batch allocations. The current inventory-service location is temporary and does
not establish a separately deployable service boundary.

Application commands must use one explicit `Prisma.TransactionClient` through
every repository call. Root-client writes inside transaction callbacks, nested
root transactions, read-then-write quantity updates, clamped underflow, and
time-derived idempotency identifiers are prohibited.

The implementation order is:

1. schema and populated migration verification;
2. focused shared transaction and audit primitives;
3. batch stock and append-only movement ledger;
4. deterministic FEFO and availability reads;
5. medicine reservation header, items, allocations, and lifecycle;
6. accepted identity/RBAC/audit application boundary; and
7. infrastructure, security, duplication, and acceptance review.

Public patient reservation creation and every delivery, payment, supplier,
clinical, and controlled-medicine workflow remain unmounted.
