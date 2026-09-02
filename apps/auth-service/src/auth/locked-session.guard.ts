import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';

import { AccessTokenIdentity } from './auth.types';
import { LockedSessionVerifierService } from './locked-session-verifier.service';

export const LOCKED_SESSION_REFRESH_HEADER = 'x-locked-session-refresh';

/**
 * Task 0014: dedicated authentication boundary for locked-state recovery
 * routes (unlock, logout-locked, switch-user).
 *
 * The normal JwtStrategy requires lockedAt = null and token sv == DB
 * securityVersion, so after a lock every pre-lock access token is rejected.
 * This guard authenticates the locked session using its own opaque,
 * single-use refresh credential (transported in a dedicated header) and
 * derives the identity from verified server-side session data. It is
 * strictly non-mutating: it never consumes, rotates, or revokes the
 * credential -- the actual unlock rotation or family revocation happens in
 * the operation itself.
 *
 * It grants access ONLY to the locked-state recovery routes it is applied
 * to. It never grants normal authorization, and it fails closed for
 * invalid, revoked, expired, wrong-family, or unlocked sessions.
 */
@Injectable()
export class LockedSessionGuard implements CanActivate {
  constructor(private readonly verifier: LockedSessionVerifierService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      user?: AccessTokenIdentity;
    }>();

    const refreshCredential = request.headers[LOCKED_SESSION_REFRESH_HEADER];
    if (!refreshCredential) {
      throw new UnauthorizedException('Authentication required');
    }

    const verification = await this.verifier.verifyLockedSession(refreshCredential);
    request.user = verification.identity;
    return true;
  }
}
