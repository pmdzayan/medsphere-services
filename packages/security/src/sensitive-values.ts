/**
 * Task 0020 — Sensitive-value guard.
 *
 * Prevents a future vertical from accidentally accepting security-sensitive
 * server-managed values through a client DTO (mass assignment / privilege
 * elevation). The security framework never trusts a client-supplied
 * userId, tenantId, membershipId, actor id, role/permission, session state,
 * provider ownership, or verification/authorization status.
 *
 * This is intentionally NOT a class-validator decorator: DTOs are the
 * caller's responsibility, and the canonical loopback import cycle is not
 * worth introducing for one property guard. `assertNoSensitiveValues` is a
 * fail-closed runtime boundary that a vertical service can call on an already
 * whitelisted DTO before persisting.
 */

const SENSITIVE_KEY =
  /^(userId|tenantId|membershipId|actorUserId|platformActorUserId|role|roles|permission|permissions|roleId|permissionId|session|sessionId|sessionState|providerId|providerOwnership|verificationStatus|authorizationStatus|status)$/i;

export function assertNoSensitiveValues(value: Record<string, unknown>): void {
  for (const key of Object.keys(value)) {
    if (SENSITIVE_KEY.test(key)) {
      throw new Error(`Sensitive server-managed field is not accepted from the client: ${key}`);
    }
  }
}
