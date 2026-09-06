import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { AuthConfigService } from '../auth/auth-config.service';
import { isUuid } from '../auth/access-token.validation';
import {
  IssuedPlatformAccessToken,
  IssuedPlatformRefreshCredential,
  PLATFORM_ACCESS_TOKEN_TYPE,
  PLATFORM_ACCESS_TOKEN_USE,
  PLATFORM_REFRESH_CREDENTIAL_PREFIX,
  PlatformAccessTokenClaims,
  PlatformAccessTokenIdentity,
  PlatformRefreshCredentialParts,
} from './platform.types';
import {
  assertValidPlatformAccessTokenClaims,
  hasExpectedPlatformAccessTokenHeader,
} from './platform-access-token.validation';

const PLATFORM_REFRESH_CREDENTIAL_PATTERN = new RegExp(
  `^${PLATFORM_REFRESH_CREDENTIAL_PREFIX.replaceAll('.', '\\.')}` +
    '([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\\.([A-Za-z0-9_-]{43})$',
);

@Injectable()
export class PlatformTokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly authConfig: AuthConfigService,
  ) {}

  issuePlatformAccessToken(identity: PlatformAccessTokenIdentity): IssuedPlatformAccessToken {
    const tokenId = randomUUID();
    const claims: PlatformAccessTokenClaims = {
      sub: identity.userId,
      paid: identity.platformAccountId,
      psid: identity.platformSessionId,
      sv: identity.securityVersion,
      jti: tokenId,
      tokenUse: PLATFORM_ACCESS_TOKEN_USE,
    };
    const configuration = this.authConfig.value;

    const value = this.jwtService.sign(claims, {
      privateKey: configuration.privateKeyPem,
      algorithm: 'RS256',
      issuer: configuration.issuer,
      audience: configuration.audience,
      expiresIn: configuration.accessTokenTtlSeconds,
      header: {
        alg: 'RS256',
        typ: PLATFORM_ACCESS_TOKEN_TYPE,
        kid: configuration.keyId,
      },
    });

    return {
      value,
      expiresIn: configuration.accessTokenTtlSeconds,
      tokenId,
    };
  }

  verifyPlatformAccessToken(token: string): PlatformAccessTokenClaims {
    const configuration = this.authConfig.value;
    if (!hasExpectedPlatformAccessTokenHeader(token, configuration.keyId)) {
      throw new UnauthorizedException('Authentication required');
    }

    let claims: unknown;
    try {
      claims = this.jwtService.verify<Record<string, unknown>>(token, {
        publicKey: configuration.publicKeyPem,
        algorithms: ['RS256'],
        issuer: configuration.issuer,
        audience: configuration.audience,
      });
    } catch {
      throw new UnauthorizedException('Authentication required');
    }

    assertValidPlatformAccessTokenClaims(claims);

    return claims;
  }

  issuePlatformRefreshCredential(
    platformSessionId: string = randomUUID(),
  ): IssuedPlatformRefreshCredential {
    if (!isUuid(platformSessionId)) {
      throw new Error('Platform session ID must be a UUID');
    }

    const verifier = randomBytes(32).toString('base64url');
    const value = `${PLATFORM_REFRESH_CREDENTIAL_PREFIX}${platformSessionId}.${verifier}`;

    return {
      value,
      hash: this.hashPlatformRefreshCredential(value),
      platformSessionId,
    };
  }

  parsePlatformRefreshCredential(value: string): PlatformRefreshCredentialParts {
    const match = PLATFORM_REFRESH_CREDENTIAL_PATTERN.exec(value);
    if (!match) {
      throw new UnauthorizedException('Invalid refresh credential');
    }

    return {
      platformSessionId: match[1],
      verifier: match[2],
    };
  }

  hashPlatformRefreshCredential(value: string): string {
    return createHmac('sha256', this.authConfig.value.refreshTokenPepper)
      .update(value, 'utf8')
      .digest('hex');
  }

  verifyPlatformRefreshCredentialHash(value: string, expectedHash: string): boolean {
    if (!/^[a-f0-9]{64}$/.test(expectedHash)) {
      return false;
    }

    const actual = Buffer.from(this.hashPlatformRefreshCredential(value), 'hex');
    const expected = Buffer.from(expectedHash, 'hex');
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }
}
