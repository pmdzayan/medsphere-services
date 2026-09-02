import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { AuthConfigService } from './auth-config.service';
import {
  ACCESS_TOKEN_TYPE,
  ACCESS_TOKEN_USE,
  AccessTokenClaims,
  AccessTokenIdentity,
  IssuedAccessToken,
  IssuedRefreshCredential,
  RefreshCredentialParts,
} from './auth.types';
import {
  assertValidAccessTokenClaims,
  hasExpectedAccessTokenHeader,
  isUuid,
} from './access-token.validation';

const REFRESH_CREDENTIAL_PATTERN =
  /^msr\.([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.([A-Za-z0-9_-]{43})$/;

@Injectable()
export class TokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly authConfig: AuthConfigService,
  ) {}

  issueAccessToken(identity: AccessTokenIdentity): IssuedAccessToken {
    const tokenId = randomUUID();
    const claims: AccessTokenClaims = {
      sub: identity.userId,
      mid: identity.membershipId,
      tid: identity.tenantId,
      sid: identity.sessionId,
      sv: identity.securityVersion,
      jti: tokenId,
      tokenUse: ACCESS_TOKEN_USE,
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
        typ: ACCESS_TOKEN_TYPE,
        kid: configuration.keyId,
      },
    });

    return {
      value,
      expiresIn: configuration.accessTokenTtlSeconds,
      tokenId,
    };
  }

  verifyAccessToken(token: string): AccessTokenClaims {
    const configuration = this.authConfig.value;
    if (!hasExpectedAccessTokenHeader(token, configuration.keyId)) {
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

    assertValidAccessTokenClaims(claims);

    return claims;
  }

  issueRefreshCredential(sessionId: string = randomUUID()): IssuedRefreshCredential {
    if (!isUuid(sessionId)) {
      throw new Error('Refresh session ID must be a UUID');
    }

    const verifier = randomBytes(32).toString('base64url');
    const value = `msr.${sessionId}.${verifier}`;

    return {
      value,
      hash: this.hashRefreshCredential(value),
      sessionId,
    };
  }

  parseRefreshCredential(value: string): RefreshCredentialParts {
    const match = REFRESH_CREDENTIAL_PATTERN.exec(value);
    if (!match) {
      throw new UnauthorizedException('Invalid refresh credential');
    }

    return {
      sessionId: match[1],
      verifier: match[2],
    };
  }

  hashRefreshCredential(value: string): string {
    return createHmac('sha256', this.authConfig.value.refreshTokenPepper)
      .update(value, 'utf8')
      .digest('hex');
  }

  verifyRefreshCredentialHash(value: string, expectedHash: string): boolean {
    if (!/^[a-f0-9]{64}$/.test(expectedHash)) {
      return false;
    }

    const actual = Buffer.from(this.hashRefreshCredential(value), 'hex');
    const expected = Buffer.from(expectedHash, 'hex');
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }
}
