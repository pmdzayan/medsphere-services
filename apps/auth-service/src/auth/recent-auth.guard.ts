import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';

import { AuthConfigService } from './auth-config.service';
import { AuthenticatedIdentity } from './auth.types';
import { SessionRepository } from './session.repository';

/**
 * Task 0014: reusable step-up boundary.
 *
 * This guard does not replace JWT authentication or authorization.
 * It requires an already-authenticated active session and additionally
 * verifies that the SAME server-side session has a sufficiently recent
 * real credential proof.
 */
@Injectable()
export class RecentAuthGuard implements CanActivate {
  constructor(
    private readonly sessionRepository: SessionRepository,
    private readonly authConfig: AuthConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      user?: AuthenticatedIdentity;
    }>();

    if (!request.user) {
      throw new UnauthorizedException('Authentication required');
    }

    const recent = await this.sessionRepository.isRecentlyAuthenticated(
      request.user,
      this.authConfig.value.recentAuthTtlSeconds,
    );

    if (!recent) {
      throw new UnauthorizedException('Recent authentication required');
    }

    return true;
  }
}
