import { Injectable, Logger } from '@nestjs/common';

export type AuthenticationSecurityEvent =
  | 'login'
  | 'registration'
  | 'session-created'
  | 'refresh'
  | 'refresh-replay'
  | 'logout'
  | 'logout-all'
  | 'session-locked'
  | 'session-unlocked'
  | 'session-unlock-failed'
  | 'session-reauthenticated'
  | 'session-reauthentication-failed'
  | 'logout-locked'
  | 'switch-user';

export interface AuthenticationSecurityEventContext {
  readonly outcome: 'success' | 'denied';
  readonly userId?: string;
  readonly membershipId?: string;
  readonly tenantId?: string;
  readonly sessionId?: string;
  readonly reason?:
    | 'invalid-credentials'
    | 'invalid-refresh-credential'
    | 'refresh-replay'
    | 'registration-processed'
    | 'session-locked'
    | 'invalid-unlock-credential'
    | 'invalid-reauthentication-credential';
}

/**
 * Structured, allowlisted security-event seam for S0.4 durable audit
 * integration. It intentionally accepts no arbitrary payload and no PII or
 * credential material.
 */
@Injectable()
export class AuthSecurityEventService {
  private readonly logger = new Logger('AuthenticationSecurityEvent');

  record(event: AuthenticationSecurityEvent, context: AuthenticationSecurityEventContext): void {
    const { outcome, userId, membershipId, tenantId, sessionId, reason } = context;
    this.logger.log({
      event: `authentication.${event}`,
      outcome,
      ...(userId ? { userId } : {}),
      ...(membershipId ? { membershipId } : {}),
      ...(tenantId ? { tenantId } : {}),
      ...(sessionId ? { sessionId } : {}),
      ...(reason ? { reason } : {}),
    });
  }
}
