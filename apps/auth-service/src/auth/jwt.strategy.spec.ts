import { randomUUID } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';

import { AuthConfigService, parseAuthEnvironment } from './auth-config.service';
import { AccessTokenClaims, AuthenticatedIdentity } from './auth.types';
import { JwtStrategy } from './jwt.strategy';
import { SessionRepository } from './session.repository';
import { createAuthConfigFixture } from './testing/auth-config-fixture';

describe('JwtStrategy', () => {
  const identity: AuthenticatedIdentity = {
    userId: randomUUID(),
    membershipId: randomUUID(),
    tenantId: randomUUID(),
    sessionId: randomUUID(),
    tokenId: randomUUID(),
  };
  const now = Math.floor(Date.now() / 1000);
  const claims: AccessTokenClaims = {
    sub: identity.userId,
    mid: identity.membershipId,
    tid: identity.tenantId,
    sid: identity.sessionId,
    jti: identity.tokenId,
    tokenUse: 'access',
    iat: now,
    exp: now + 300,
  };
  const validateAccessIdentity = jest.fn();
  const sessionRepository = { validateAccessIdentity } as unknown as SessionRepository;
  const authConfig = {
    value: parseAuthEnvironment(createAuthConfigFixture()),
  } as AuthConfigService;
  const strategy = new JwtStrategy(authConfig, sessionRepository);

  beforeEach(() => {
    validateAccessIdentity.mockReset();
  });

  it('returns only an identity backed by the exact active session chain', async () => {
    validateAccessIdentity.mockResolvedValue(identity);

    await expect(strategy.validate(claims)).resolves.toEqual(identity);
    expect(validateAccessIdentity).toHaveBeenCalledWith(
      {
        userId: identity.userId,
        membershipId: identity.membershipId,
        tenantId: identity.tenantId,
        sessionId: identity.sessionId,
      },
      identity.tokenId,
    );
  });

  it('rejects a token when the active identity chain no longer exists', async () => {
    validateAccessIdentity.mockResolvedValue(null);

    await expect(strategy.validate(claims)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects malformed claims before any database lookup', async () => {
    const malformed = { ...claims, tid: 'not-a-uuid' };

    await expect(strategy.validate(malformed)).rejects.toThrow(UnauthorizedException);
    expect(validateAccessIdentity).not.toHaveBeenCalled();
  });
});
