import { UnauthorizedException } from '@nestjs/common';
import { AccessTokenIdentity } from './auth.types';
import { LockedSessionVerifierService } from './locked-session-verifier.service';
import { SessionStateGuard, SESSION_STATE_REFRESH_HEADER } from './session-state.guard';

describe('SessionStateGuard', () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const membershipId = '22222222-2222-4222-8222-222222222222';
  const tenantId = '33333333-3333-4333-8333-333333333333';
  const sessionId = '44444444-4444-4444-8444-444444444444';

  let verifier: jest.Mocked<LockedSessionVerifierService>;
  let guard: SessionStateGuard;

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
    guard = new SessionStateGuard(verifier);
  });

  function createContext(headers: Record<string, string | undefined>) {
    const request = {
      headers,
      user: undefined as AccessTokenIdentity | undefined,
      sessionState: undefined as
        { locked: boolean; lockedAt: Date | null; securityVersion: number } | undefined,
    };
    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as import('@nestjs/common').ExecutionContext;
  }

  it('sets identity and session state for a locked session', async () => {
    const lockedAt = new Date();
    verifier.verifySessionState.mockResolvedValue({
      identity,
      locked: true,
      lockedAt,
      securityVersion: 2,
    });

    const context = createContext({ [SESSION_STATE_REFRESH_HEADER]: 'msr.presented' });
    const canActivate = await guard.canActivate(context);

    expect(canActivate).toBe(true);
    const request = context.switchToHttp().getRequest<{
      user?: AccessTokenIdentity;
      sessionState?: { locked: boolean; lockedAt: Date | null; securityVersion: number };
    }>();
    expect(request.user).toEqual(identity);
    expect(request.sessionState).toEqual({ locked: true, lockedAt, securityVersion: 2 });
  });

  it('reports active state for an unlocked session', async () => {
    verifier.verifySessionState.mockResolvedValue({
      identity,
      locked: false,
      lockedAt: null,
      securityVersion: 1,
    });

    const context = createContext({ [SESSION_STATE_REFRESH_HEADER]: 'msr.active' });
    await guard.canActivate(context);

    const request = context.switchToHttp().getRequest<{
      sessionState?: { locked: boolean; lockedAt: Date | null; securityVersion: number };
    }>();
    expect(request.sessionState).toEqual({ locked: false, lockedAt: null, securityVersion: 1 });
  });

  it('rejects when the refresh header is missing', async () => {
    const context = createContext({});

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    expect(verifier.verifySessionState).not.toHaveBeenCalled();
  });

  it('propagates verifier denials', async () => {
    verifier.verifySessionState.mockRejectedValue(
      new UnauthorizedException('Authentication required'),
    );

    const context = createContext({ [SESSION_STATE_REFRESH_HEADER]: 'msr.invalid' });

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });
});
