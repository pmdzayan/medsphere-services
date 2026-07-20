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

const REFRESH_CREDENTIAL_PATTERN =
  /^msr\.([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.([A-Za-z0-9_-]{43})$/;

function isUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

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
    let decoded: ReturnType<JwtService['decode']>;
    try {
      decoded = this.jwtService.decode(token, { complete: true });
    } catch {
      throw new UnauthorizedException('Authentication required');
    }
    const header =
      decoded && typeof decoded === 'object' && 'header' in decoded ? decoded.header : undefined;
    if (
      !header ||
      typeof header !== 'object' ||
      !('alg' in header) ||
      !('typ' in header) ||
      !('kid' in header) ||
      header.alg !== 'RS256' ||
      header.typ !== ACCESS_TOKEN_TYPE ||
      header.kid !== configuration.keyId
    ) {
      throw new UnauthorizedException('Authentication required');
    }

    let claims: AccessTokenClaims;
    try {
      claims = this.jwtService.verify<AccessTokenClaims>(token, {
        publicKey: configuration.publicKeyPem,
        algorithms: ['RS256'],
        issuer: configuration.issuer,
        audience: configuration.audience,
      });
    } catch {
      throw new UnauthorizedException('Authentication required');
    }

    if (
      claims.tokenUse !== ACCESS_TOKEN_USE ||
      !isUuid(claims.sub) ||
      !isUuid(claims.mid) ||
      !isUuid(claims.tid) ||
      !isUuid(claims.sid) ||
      !isUuid(claims.jti) ||
      !Number.isInteger(claims.iat) ||
      !Number.isInteger(claims.exp) ||
      (claims.exp as number) <= (claims.iat as number)
    ) {
      throw new UnauthorizedException('Authentication required');
    }

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
