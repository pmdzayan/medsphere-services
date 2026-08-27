# ADR-024 — MSG91 SMS Provider Adapter for Phone OTP Delivery

- Status: Proposed
- Date: 2026-08-27
- Scope: Task 0005 only; production-capable delivery adapter behind ADR-023.

## Context

ADR-023 made MedSphere the sole phone-OTP authority and established a
provider-neutral, fail-closed SMS delivery boundary. MedSphere owns OTP
generation, hashing, expiration, verification, resend limits, attempt limits,
Redis throttling, destination binding/phone normalization, challenge lifecycle,
and account-activation policy. A provider adapter must not duplicate any of
those responsibilities.

MSG91 exposes a Flow API for sending messages from an existing Flow and also
separate provider-managed OTP products. Task 0005 uses only the Flow endpoint:
`POST https://api.msg91.com/api/v5/flow/`. MSG91 receives the OTP MedSphere
already generated as a named Flow variable. The adapter does not call MSG91
SendOTP, Verify OTP, or any provider-side OTP verification/state-machine API.

## Flow ID and DLT Template ID are different concepts

`MSG91_FLOW_ID` is the MSG91 Flow identifier placed in the API payload as
`flow_id`. It is the runtime identifier this adapter needs.

An Indian DLT Template ID is a telecom/DLT regulatory identifier associated
with approved message content. It is configured/mapped through the provider
and DLT process where applicable; it is not the `flow_id`, and Task 0005 does
not introduce an unused `MSG91_DLT_TEMPLATE_ID` setting. The sender/header
(`MSG91_SENDER_ID`) must likewise be configured and DLT-approved where
applicable before live Indian transactional SMS is activated.

## Decision

1. `SmsProviderDeliveryInput` gains the additive optional `otpCode` field.
   `PhoneOtpService` passes the exact code it generated alongside the existing
   composed body. MSG91 uses only `otpCode`; it never parses the body to recover
   security-sensitive state.
2. `Msg91SmsProviderAdapter` sends only to the centralized HTTPS Flow endpoint
   `https://api.msg91.com/api/v5/flow/`. The endpoint is not user-configurable.
3. The request contains `flow_id: config.flowId`, `sender`, one normalized
   recipient, and one bounded Flow variable containing MedSphere's six-digit
   OTP. The auth key is sent only in the `authkey` header, never in a URL.
4. The adapter performs a final fail-closed boundary check using MedSphere's
   existing E.164 validator and OTP-format validator. This does not duplicate
   phone normalization or change OTP generation policy.
5. Configuration is validated before network I/O. Empty auth key, Flow ID, or
   sender ID; invalid/empty Flow variable name; and timeout values outside
   ADR-023's existing 250–10,000 ms bound are rejected without exposing secret
   values. The OTP Flow variable defaults to `OTP` only when it is absent.
6. `OTP_SMS_PROVIDER_CREDENTIAL_REFERENCE` remains indirection to a deployment
   secret/config key. The factory resolves that reference using the existing
   `@medsphere/config` `loadEnv` pattern. No credential is committed.
7. SMS remains disabled by default. Only explicit provider key `msg91` can wire
   this adapter. Unsupported, `mock`, `test`, and `fake` keys receive no adapter
   and fail closed; there is no synthetic production fallback.

## Failure classification and retry boundary

MedSphere keeps retry/challenge policy outside MSG91. The adapter classifies
only the delivery attempt:

- network/DNS error or timeout: `TRANSIENT`
- HTTP 429: `TRANSIENT`
- HTTP 5xx: `TRANSIENT`
- HTTP 400/401/403/422: `TERMINAL`
- unexpected HTTP 3xx: `TERMINAL` and redirects are not followed
- functional MSG91 `type: "error"`: `TERMINAL`
- malformed 2xx JSON, missing/empty/non-string provider reference, or otherwise
  malformed success payload: `TERMINAL`

A successful call returns only `{ acknowledgement: "ACCEPTED",
providerReference: <opaque request id> }`. Raw MSG91 bodies are never returned.

## Privacy and logging boundary

The adapter adds no logging. Auth key, destination phone number, plaintext OTP,
composed SMS body, request headers, and raw MSG91 response payloads must never
appear in thrown errors, logs, returned provider results, or the request URL.
Normalized provider/error codes are the only failure details surfaced.

## Security consequences

Task 0005 does not change tenant isolation, RBAC, authentication, account
activation, audit behavior, OTP challenge persistence, retry/resend/attempt
limits, Redis throttling, phone normalization, or verification semantics.
The SMS provider cannot mark a phone verified. Only MedSphere's existing
`PhoneOtpService.verifyOtp` path can consume a valid challenge and delegate to
`AccountVerificationService.applyPhoneVerified`.

## External production activation still required

Repository code completeness does **not** mean live SMS is activated. External
work still requires all of the following before production use:

- a real MSG91 account
- a real MSG91 auth key stored in deployment secrets
- DLT entity/header/template approval and mapping where required
- a configured MSG91 Flow and real `MSG91_FLOW_ID`
- correct deployment configuration/secrets for sender and Flow variable
- a controlled live SMS test using real credentials
- deployment and exact-head GitHub CI in the real environment

None of those external steps are claimed complete by this ADR or Task 0005.
