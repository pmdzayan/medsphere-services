# Volume 05 — Backend Bible: Identity and Authentication

**Sprint:** S0.3 Authentication and Trusted Tenant Context

**Decision:** ADR-003

**Status:** Implementation in progress; not production-approved

## Purpose and boundary

The authentication module establishes a trusted global user, tenant membership, tenant, and session context. It authenticates identity only. Tenant-safe roles, permissions, policy evaluation, and durable audit persistence remain S0.4.

The active auth-service application mounts only health, authentication, self-user privacy/language, and language metadata. RBAC, audit, providers, verification, products, and inventory prototype modules remain in source but are deliberately unmounted until their dependency-ordered sprints accept their authorization boundaries.

## Accepted route contract

| Method | Route                | Access         | Authoritative context                        |
| ------ | -------------------- | -------------- | -------------------------------------------- |
| POST   | `/auth/register`     | Public/limited | Normalized tenant slug plus tenant policy    |
| POST   | `/auth/login`        | Public/limited | Active user-membership-tenant database chain |
| POST   | `/auth/refresh`      | Public/limited | Stored session membership                    |
| POST   | `/auth/logout`       | Authenticated  | Verified request identity                    |
| POST   | `/auth/logout-all`   | Authenticated  | Verified global user                         |
| GET    | `/users/me/privacy`  | Authenticated  | Verified request identity user               |
| PATCH  | `/users/me/privacy`  | Authenticated  | Verified request identity user               |
| PATCH  | `/users/me/language` | Authenticated  | Verified request identity user               |

No accepted endpoint takes an authoritative user, membership, tenant, or session ID from the request body, path, query, or custom header.

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

Repositories own persistence queries; controllers do not access Prisma. Services own orchestration and security state transitions. DTOs own transport validation and normalization. The access identity is readonly and contains `userId`, `membershipId`, `tenantId`, `sessionId`, and the verified token ID.

## Validation and API documentation

- The shared validation pipe strips no unknown fields silently: it rejects them.
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

## Error and logging rules

- Login always returns `Invalid credentials` for unknown user, tenant, membership, status, or password.
- Registration always returns the same accepted response and never attaches an existing global identity publicly.
- Refresh errors do not distinguish missing, expired, revoked, or replayed credentials to the caller.
- Logs and event payloads must never contain passwords, access tokens, refresh credentials, token digests, keys, email addresses, authorization headers, or credential request bodies.
- Authentication security events are operational evidence only until S0.4 integrates a durable, tenant-safe audit record.

## Future extension seams

S0.4 consumes the trusted identity for RBAC and audit. Later reviewed work may add invitation onboarding, email verification, password recovery, MFA/passkeys, device management, external identity providers, and a measured revocation cache. None may weaken membership-derived tenant context or bypass session revocation.
