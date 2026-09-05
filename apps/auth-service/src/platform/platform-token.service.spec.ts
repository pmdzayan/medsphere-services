import { randomUUID } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthConfigService, parseAuthEnvironment } from '../auth/auth-config.service';
import { TokenService } from '../auth/token.service';
import { createAuthConfigFixture } from '../auth/testing/auth-config-fixture';
import { PlatformTokenService } from './platform-token.service';
import { PlatformAccessTokenIdentity } from './platform.types';

describe('PlatformTokenService', () => {
  const configuration = parseAuthEnvironment(createAuthConfigFixture());
  const jwtService = new JwtService();
  const platformService = new PlatformTokenService(jwtService, {
    value: configuration,
  } as AuthConfigService);
  const tenantService = new TokenService(jwtService, {
    value: configuration,
  } as AuthConfigService);

  const platformIdentity: PlatformAccessTokenIdentity = {
    userId: randomUUID(),
    platformAccountId: randomUUID(),
    platformSessionId: randomUUID(),
    securityVersion: 1,
  };

  const tenantIdentity = {
    userId: randomUUID(),
    membershipId: randomUUID(),
    tenantId: randomUUID(),
    sessionId: randomUUID(),
    securityVersion: 1,
  };

  it('issues a platform access token with NO tenantId/membershipId claims', () => {
    const issued = platformService.issuePlatformAccessToken(platformIdentity);
    const verified = platformService.verifyPlatformAccessToken(issued.value);
    const decoded = jwtService.decode(issued.value, { complete: true });

    expect(verified).toMatchObject({
      sub: platformIdentity.userId,
      paid: platformIdentity.platformAccountId,
      psid: platformIdentity.platformSessionId,
      sv: 1,
      tokenUse: 'platform-access',
    });
    expect(verified).not.toHaveProperty('mid');
    expect(verified).not.toHaveProperty('tid');
    expect(verified).not.toHaveProperty('sid');
    expect(decoded).toMatchObject({
      header: { alg: 'RS256', typ: 'pt+jwt', kid: configuration.keyId },
    });
  });

  it('rejects a tenant access token when validated as a platform token', () => {
    const tenantToken = tenantService.issueAccessToken(tenantIdentity);
    expect(() => platformService.verifyPlatformAccessToken(tenantToken.value)).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a platform access token when validated as a tenant token', () => {
    const platformToken = platformService.issuePlatformAccessToken(platformIdentity);
    expect(() => tenantService.verifyAccessToken(platformToken.value)).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a platform token that smuggles tenant claims', () => {
    const token = jwtService.sign(
      {
        sub: platformIdentity.userId,
        paid: platformIdentity.platformAccountId,
        psid: platformIdentity.platformSessionId,
        mid: randomUUID(),
        sid: randomUUID(),
        tid: randomUUID(),
        sv: 1,
        jti: randomUUID(),
        tokenUse: 'platform-access',
      },
      {
        privateKey: configuration.privateKeyPem,
        algorithm: 'RS256',
        issuer: configuration.issuer,
        audience: configuration.audience,
        expiresIn: 300,
        header: { alg: 'RS256', typ: 'pt+jwt', kid: configuration.keyId },
      },
    );
    expect(() => platformService.verifyPlatformAccessToken(token)).toThrow(UnauthorizedException);
  });

  it('returns the generic authentication error for malformed platform tokens', () => {
    expect(() => platformService.verifyPlatformAccessToken('not-a-jwt')).toThrow(
      UnauthorizedException,
    );
  });

  it('issues a platform refresh credential and stores only its digest', () => {
    const issued = platformService.issuePlatformRefreshCredential();
    const parts = platformService.parsePlatformRefreshCredential(issued.value);

    expect(parts.platformSessionId).toBe(issued.platformSessionId);
    expect(Buffer.from(parts.verifier, 'base64url')).toHaveLength(32);
    expect(issued.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(issued.hash).not.toContain(parts.verifier);
    expect(platformService.verifyPlatformRefreshCredentialHash(issued.value, issued.hash)).toBe(
      true,
    );
    expect(
      platformService.verifyPlatformRefreshCredentialHash(`${issued.value}x`, issued.hash),
    ).toBe(false);
  });

  it('a tenant refresh credential is not parseable as a platform refresh credential', () => {
    const tenantRefresh = tenantService.issueRefreshCredential();
    expect(() => platformService.parsePlatformRefreshCredential(tenantRefresh.value)).toThrow(
      UnauthorizedException,
    );
  });
});
