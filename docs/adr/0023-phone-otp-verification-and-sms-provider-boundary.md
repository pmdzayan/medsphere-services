# ADR-023 — Real Phone OTP Verification and SMS Provider Activation Boundary

- Status: Proposed
- Date: 2026-08-26
- Scope: Replaces the mock-only phone verification path with a
  production-capable OTP flow, and defines the SMS provider activation
  boundary needed to deliver it.

## Context

Phone verification today only exists through
`AccountVerificationService.completeMockVerification`, gated behind
`ENABLE_TEST_VERIFICATION_PROVIDER` and disabled outright in production. It
sets `phoneVerifiedAt` directly from a caller-supplied `approved` boolean --
there is no real challenge, no code, and no delivery mechanism. Its
activation-eligibility check (phone + identity + age all approved -->
activate user + membership) depends only on the resulting `User` fields,
never on which method or provider produced them, so a real OTP path can
feed it without altering that policy.

ADR-021 established a provider-neutral, fail-closed notification
activation contract and reserved `SMS` as a channel explicitly not yet
approved. `AccountVerificationAttempt` already gives a replay-safe,
audited attempt log (idempotency key + command hash) that a new provider
value can reuse without any structural change. `AuditEvent.eventType` is
enforced by a database `CHECK` constraint allowlist with a per-event-type
metadata-key allowlist that already forbids any key containing "phone" --
the audit privacy requirement here is structural, not a policy this ADR
has to invent. Refresh-credential hashing (HMAC-SHA256 keyed by a
server-side pepper, constant-time compare) is the established pattern for
storing a secret's cryptographic representation and is reused here for
OTP codes rather than a slow password hash (argon2 adds no meaningful
resistance for a 6-digit space where attempt-count is already the binding
constraint) or a bare unkeyed digest (which would let a stolen table be
brute-forced offline against the 10^6 code space).

## Decision

1. **New persistence, not reused persistence.** `PhoneOtpChallenge` is a
   new table: live, mutable, single-use challenge state, deliberately
   separate from the immutable `AccountVerificationAttempt` log. Exactly
   one active challenge exists per `(tenantId, userId)`; requesting a new
   OTP overwrites it after a resend-cooldown check. Only an HMAC-SHA256
   hash of the code is stored, keyed by a new `AUTH_OTP_PEPPER` secret
   (same shape/validation as `AUTH_REFRESH_TOKEN_PEPPER`) -- never the
   plaintext code, anywhere.
2. **Reuse the existing activation policy verbatim.** The tail of
   `completeMockVerification` (eligibility check, conditional
   activation, `authentication.account.activated` audit) is extracted
   into a shared `finalizeVerificationOutcome` method, unchanged in
   behavior. A new `applyPhoneVerified(transaction, {tenantId, userId})`
   entry point lets the OTP path update `phoneVerifiedAt` and immediately
   apply the same eligibility check inside the OTP service's own
   transaction, without touching identity/age verification gates. Phone
   verification alone never activates an account if identity or age
   verification remain incomplete -- this is inherited, not reimplemented.
3. **SMS is a new, separate provider-activation module, not a
   generalization of the accepted EMAIL registry.**
   `sms-provider-activation.contracts.ts` mirrors
   `notification-provider-activation.contracts.ts` file-for-file (deny-by
   default, explicit provider key + secret-reference pattern, bounded
   timeout, fail-closed `PROVIDER_UNAVAILABLE`) rather than modifying
   `ContractNotificationProviderRegistry` into a multi-channel registry.
   This keeps the accepted EMAIL contract and its existing tests
   completely untouched, at the cost of some duplication.
4. **No vendor is selected or activated.** `sms-provider-registry.factory.ts`
   can only ever construct a registry with no adapter -- there is no SMS
   adapter implementation in this change, the same fail-closed state EMAIL
   was in before PR #66. Selecting a commercial SMS vendor is a separate
   deployment/business decision this ADR does not make.
5. **Delivery is synchronous, not routed through the outbox/worker
   queue.** The accepted `NotificationDelivery`/outbox/worker pipeline
   (ADR-013/015/016) is built for eventual, retryable delivery of
   domain-event-triggered notifications and is not modified here. OTP has
   a tight interactive latency requirement a polling worker cadence does
   not fit well. The challenge row is written in its own short
   transaction; the SMS provider call happens afterward, outside any open
   transaction (an external network call must never hold a SERIALIZABLE
   transaction open); if dispatch fails, the just-created challenge is
   invalidated so the resend cooldown never blocks a user from retrying a
   code they never received. This is a deliberate, narrower alternative
   to full outbox integration, recorded here rather than silently chosen.
6. **Request/verify responses stay non-enumerating on the identity axis,
   but the resend cooldown is not server-echoed.** `requestOtp` returns
   the same generic message whether or not the `(tenantSlug, email)` pair
   is eligible, mirroring `RegistrationResponseDto`'s established
   convention -- including when a request is silently dropped because the
   existing challenge is still within its cooldown window. Resend-cooldown
   UX (a visible countdown) is therefore a client-side timer started on
   any successful submission, not a value read back from the server. This
   tradeoff is deliberate and stated here rather than picked implicitly.
7. **Verify-outcome distinctions are UX-actionable, not
   enumeration-relevant.** Wrong code, expired code, and attempt
   exhaustion return distinct messages (the last two guide the user to
   request a new code); none of these reveal whether an account/phone
   exists, since they are only reachable once a caller already knows a
   `(tenantSlug, email)` pair with an active OTP flow.
8. **Concurrency correctness comes from the existing SERIALIZABLE +
   retry idiom**, not bespoke locking: two concurrent verify calls against
   the same challenge will have one succeed and consume it; the other
   serializes, retries, re-reads the now-consumed row, and is idempotent
   only if it submitted the same code that already succeeded --
   a different code against an already-consumed challenge is always
   rejected.
9. **One new audit event type**, `authentication.otp.requested`, added to
   the `AuditEvent` allowlist (both the TypeScript constant and the
   database `CHECK` constraint, mirroring the exact migration pattern
   used for `verified_adult_account_foundation`). Verification
   success/failure reuses the existing `authentication.verification.completed`
   event type with `provider: 'SMS_OTP'` -- no new allowlist entry needed
   there, since its metadata-key allowlist already covers `method`,
   `provider`, `status`, `age18Plus`.

## Alternatives considered

- **Generalize `ContractNotificationProviderRegistry` into a real
  multi-channel registry.** Rejected for this change: it would touch
  accepted, tested EMAIL activation code for a benefit (removing some
  duplication) that does not outweigh the risk of regressing an already
  reviewed boundary. Worth revisiting once a second real channel is
  actually activated, as its own reviewed refactor.
- **Route OTP delivery through the existing notification outbox/worker.**
  Rejected for this change on latency grounds (see Decision #5); the
  outbox model is correct for reservation notifications precisely because
  they are not interactive-latency-sensitive.
- **Hash OTP codes with argon2** (matching password hashing). Rejected:
  argon2's deliberate slowness defends against offline dictionary attacks
  on user-chosen high-entropy-adjacent secrets; a 6-digit OTP's real
  defense is attempt-count binding and short TTL, and the existing
  HMAC-pepper pattern for refresh credentials is the correct precedent for
  a keyed representation of a short-lived, single-use secret.
- **Echo resend-cooldown seconds-remaining to the client.** Rejected in
  favor of a client-side timer, to avoid making the request endpoint's
  response shape depend on account existence (see Decision #6).

## Implementation boundary

New files under `apps/auth-service/src/verification/otp/`:
`otp-crypto.util.ts`, `phone-normalization.ts`,
`sms-provider-activation.contracts.ts`, `sms-provider-registry.factory.ts`,
`phone-otp.service.ts`, and DTOs. `account-verification.service.ts` gains
`finalizeVerificationOutcome` (extracted, behavior-unchanged) and
`applyPhoneVerified` (new). `verification.controller.ts` gains
`phone/otp/request` and `phone/otp/verify`. `verification.module.ts` wires
`PhoneOtpService` and a `ContractSmsProviderRegistry` provider.
`auth-rate-limit.module.ts` gains two named throttlers (`otp-request`:
1/min, `otp-verify`: 10/min per account), each scoped via `skipIf` to its
own handler name so they do not apply to any other route. `AuthConfigService`
gains `otpPepper` (`AUTH_OTP_PEPPER`, >= 32 random bytes, same validation
as the refresh-token pepper), wired through `.env.example`,
`scripts/generate-dev-keys.js`, both CI workflows' generated-material
env blocks, and both `docker-compose` files. Schema: `PhoneOtpChallenge`
table, `SMS_OTP` added to `AccountVerificationProvider`, one new audit
event type -- migration `20260826070000_phone_otp_verification`.

## Acceptance evidence

Not yet accepted. Prettier, ESLint, `git diff --check`, and the
architecture boundary check all pass locally. Pure-function unit tests
(OTP crypto, phone normalization, SMS activation contract -- 24 tests)
run and pass in this environment. `PhoneOtpService`'s own unit test and
every PostgreSQL/Redis-backed integration test could not run in this
sandbox: `@medsphere/database`'s `index.ts` eagerly constructs a real
`PrismaClient`, which requires the generated query-engine binary this
sandbox cannot fetch from `binaries.prisma.sh` -- the same pre-existing,
documented constraint noted in prior sessions, not a defect introduced
here. This ADR and its implementation are submitted for CTO review, CI
execution, and the PostgreSQL/Redis-backed gates before acceptance.

## Consequences

A real, production-capable phone OTP flow exists behind a fail-closed SMS
boundary. Nothing in this change relaxes identity or age verification;
account activation still requires all three gates. Selecting and
activating a real SMS vendor, and building its adapter (mirroring
`SmtpNotificationProviderAdapter`), remains open follow-on work. The
frontend OTP entry flow is not part of this change and remains a gap
recorded for CTO review.
