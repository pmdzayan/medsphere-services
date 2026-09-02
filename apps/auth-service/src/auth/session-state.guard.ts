import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';

import { AccessTokenIdentity } from './auth.types';
import { LockedSessionVerifierService } from './locked-session-verifier.service';

/** Same dedicated transport header as the locked-session recovery routes. */
export const SESSION_STATE_REFRESH_HEADER = 'x-locked-session-refresh';

/**
 * Task 0014: authentication boundary for the current-session-state endpoint.
 * A locked workstation cannot present a valid access JWT, so this guard
 * authenticates via the session's own opaque refresh credential and reports
 * server-side lock state without consuming or rotating the credential.
 * Grants access only to the session-state endpoint -- never normal
 * authorization, and never any protected healthcare data.
 */
@Injectable()
export class SessionStateGuard implements CanActivate {
  constructor(private readonly verifier: LockedSessionVerifierService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      user?: AccessTokenIdentity;
      sessionState?: { locked: boolean; lockedAt: Date | null; securityVersion: number };
    }>();

    const refreshCredential = request.headers[SESSION_STATE_REFRESH_HEADER];
    if (!refreshCredential) {
      throw new UnauthorizedException('Authentication required');
    }

    const verification = await this.verifier.verifySessionState(refreshCredential);
    request.user = verification.identity;
    request.sessionState = {
      locked: verification.locked,
      lockedAt: verification.lockedAt,
      securityVersion: verification.securityVersion,
    };
    return true;
  }
}
