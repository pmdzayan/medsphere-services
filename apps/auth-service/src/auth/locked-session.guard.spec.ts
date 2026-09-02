import { UnauthorizedException } from '@nestjs/common';
import { AccessTokenIdentity } from './auth.types';
import { LockedSessionGuard, LOCKED_SESSION_REFRESH_HEADER } from './locked-session.guard';
import { LockedSessionVerifierService } from './locked-session-verifier.service';

describe('LockedSessionGuard', () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const membershipId = '22222222-2222-4222-8222-222222222222';
  const tenantId = '33333333-3333-4333-8333-333333333333';
  const sessionId = '44444444-4444-4444-8444-444444444444';

  let verifier: jest.Mocked<LockedSessionVerifierService>;
  let guard: LockedSessionGuard;

  const identity: AccessTokenIdentity = {
    userId,
    membershipId,
    tenantId,
    sessionId,
    securityVersion: 2,
  };

  beforeEach(() => {
    verifier = {
      verifyLockedSession: jest.fn(),
      verifySessionState: jest.fn(),
    } as unknown as jest.Mocked<LockedSessionVerifierService>;
    guard = new LockedSessionGuard(verifier);
  });

  function createContext(headers: Record<string, string | undefined>) {
    const request = { headers, user: undefined as AccessTokenIdentity | undefined };
    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as import('@nestjs/common').ExecutionContext;
  }

  it('sets the verified identity on the request for a locked session', async () => {
    verifier.verifyLockedSession.mockResolvedValue({
      identity,
      lockedAt: new Date(),
      securityVersion: 2,
    });

    const context = createContext({ [LOCKED_SESSION_REFRESH_HEADER]: 'msr.presented' });
    const canActivate = await guard.canActivate(context);

    expect(canActivate).toBe(true);
    expect(verifier.verifyLockedSession).toHaveBeenCalledWith('msr.presented');
    expect(context.switchToHttp().getRequest<{ user?: AccessTokenIdentity }>().user).toEqual(
      identity,
    );
  });

  it('rejects a request without the locked-session refresh header', async () => {
    const context = createContext({});

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    expect(verifier.verifyLockedSession).not.toHaveBeenCalled();
  });

  it('propagates verifier denials (invalid/revoked/expired/unlocked)', async () => {
    verifier.verifyLockedSession.mockRejectedValue(
      new UnauthorizedException('Authentication required'),
    );

    const context = createContext({ [LOCKED_SESSION_REFRESH_HEADER]: 'msr.invalid' });

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('never grants access for an unlocked session', async () => {
    verifier.verifyLockedSession.mockRejectedValue(
      new UnauthorizedException('Authentication required'),
    );

    const context = createContext({ [LOCKED_SESSION_REFRESH_HEADER]: 'msr.unlocked' });

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });
});
