import { randomUUID } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthConfigService, parseAuthEnvironment } from './auth-config.service';
import { TokenService } from './token.service';
import { createAuthConfigFixture } from './testing/auth-config-fixture';

describe('TokenService', () => {
  const configuration = parseAuthEnvironment(createAuthConfigFixture());
  const jwtService = new JwtService();
  const service = new TokenService(jwtService, {
    value: configuration,
  } as AuthConfigService);

  const identity = {
    userId: randomUUID(),
    membershipId: randomUUID(),
    tenantId: randomUUID(),
    sessionId: randomUUID(),
  };

  it('issues and strictly verifies a minimal RS256 access token', () => {
    const issued = service.issueAccessToken(identity);
    const verified = service.verifyAccessToken(issued.value);
    const decoded = jwtService.decode(issued.value, { complete: true });

    expect(verified).toMatchObject({
      sub: identity.userId,
      mid: identity.membershipId,
      tid: identity.tenantId,
      sid: identity.sessionId,
      tokenUse: 'access',
    });
    expect(decoded).toMatchObject({
      header: { alg: 'RS256', typ: 'at+jwt', kid: configuration.keyId },
    });
    expect(verified).not.toHaveProperty('email');
    expect(verified).not.toHaveProperty('roles');
  });

  it('rejects a token with a different issuer', () => {
    const token = jwtService.sign(
      {
        sub: identity.userId,
        mid: identity.membershipId,
        tid: identity.tenantId,
        sid: identity.sessionId,
        jti: randomUUID(),
        tokenUse: 'access',
      },
      {
        privateKey: configuration.privateKeyPem,
        algorithm: 'RS256',
        issuer: 'https://attacker.test',
        audience: configuration.audience,
        expiresIn: 300,
        header: {
          alg: 'RS256',
          typ: 'at+jwt',
          kid: configuration.keyId,
        },
      },
    );

    expect(() => service.verifyAccessToken(token)).toThrow(UnauthorizedException);
  });

  it('rejects malformed access input with the generic authentication error', () => {
    expect(() => service.verifyAccessToken('not-a-jwt')).toThrow(UnauthorizedException);
  });

  it('issues a 256-bit opaque refresh credential and stores only its digest', () => {
    const issued = service.issueRefreshCredential();
    const parts = service.parseRefreshCredential(issued.value);

    expect(parts.sessionId).toBe(issued.sessionId);
    expect(Buffer.from(parts.verifier, 'base64url')).toHaveLength(32);
    expect(issued.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(issued.hash).not.toContain(parts.verifier);
    expect(service.verifyRefreshCredentialHash(issued.value, issued.hash)).toBe(true);
    expect(service.verifyRefreshCredentialHash(`${issued.value}x`, issued.hash)).toBe(false);
  });

  it('rejects malformed refresh credentials before database access', () => {
    expect(() => service.parseRefreshCredential('not-a-refresh-credential')).toThrow(
      UnauthorizedException,
    );
  });
});
