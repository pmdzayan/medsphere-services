import { ExecutionContext, UnauthorizedException } from '@nestjs/common';

import { AuthConfigService } from './auth-config.service';
import { AuthenticatedIdentity } from './auth.types';
import { RecentAuthGuard } from './recent-auth.guard';
import { SessionRepository } from './session.repository';

describe('RecentAuthGuard', () => {
  const identity: AuthenticatedIdentity = {
    userId: '00000000-0000-4000-8000-000000000001',
    membershipId: '00000000-0000-4000-8000-000000000002',
    tenantId: '00000000-0000-4000-8000-000000000003',
    sessionId: '00000000-0000-4000-8000-000000000004',
    securityVersion: 2,
    tokenId: '00000000-0000-4000-8000-000000000005',
  };

  let repository: jest.Mocked<SessionRepository>;
  let guard: RecentAuthGuard;

  const context = {
    switchToHttp: () => ({
      getRequest: () => ({ user: identity }),
    }),
  } as unknown as ExecutionContext;

  beforeEach(() => {
    repository = {
      isRecentlyAuthenticated: jest.fn(),
    } as unknown as jest.Mocked<SessionRepository>;

    guard = new RecentAuthGuard(repository, {
      value: {
        recentAuthTtlSeconds: 300,
      },
    } as AuthConfigService);
  });

  it('allows an exact active session with recent server-side authentication', async () => {
    repository.isRecentlyAuthenticated.mockResolvedValue(true);

    await expect(guard.canActivate(context)).resolves.toBe(true);

    expect(repository.isRecentlyAuthenticated).toHaveBeenCalledWith(identity, 300);
  });

  it('fails closed when recent authentication is missing or expired', async () => {
    repository.isRecentlyAuthenticated.mockResolvedValue(false);

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('fails closed when authenticated identity is absent', async () => {
    const missingIdentityContext = {
      switchToHttp: () => ({
        getRequest: () => ({ user: undefined }),
      }),
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(missingIdentityContext)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    expect(repository.isRecentlyAuthenticated).not.toHaveBeenCalled();
  });
});
