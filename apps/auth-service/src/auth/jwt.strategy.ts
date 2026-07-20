import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { AuthConfigService } from './auth-config.service';
import { SessionRepository } from './session.repository';
import {
  ACCESS_TOKEN_TYPE,
  ACCESS_TOKEN_USE,
  AccessTokenClaims,
  AuthenticatedIdentity,
} from './auth.types';

function isUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

function hasExpectedHeader(rawToken: string, keyId: string): boolean {
  const parts = rawToken.split('.');
  if (parts.length !== 3 || !parts[0]) {
    return false;
  }

  try {
    const parsed: unknown = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    return (
      typeof parsed === 'object' &&
      parsed !== null &&
      (parsed as { alg?: unknown }).alg === 'RS256' &&
      (parsed as { typ?: unknown }).typ === ACCESS_TOKEN_TYPE &&
      (parsed as { kid?: unknown }).kid === keyId
    );
  } catch {
    return false;
  }
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    authConfig: AuthConfigService,
    private readonly sessionRepository: SessionRepository,
  ) {
    const configuration = authConfig.value;
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      algorithms: ['RS256'],
      issuer: configuration.issuer,
      audience: configuration.audience,
      secretOrKeyProvider: (
        _request: unknown,
        rawToken: string,
        done: (error: Error | null, secret?: string | Buffer) => void,
      ) => {
        if (!hasExpectedHeader(rawToken, configuration.keyId)) {
          done(new Error('Invalid access-token header'));
          return;
        }
        done(null, configuration.publicKeyPem);
      },
    });
  }

  async validate(claims: AccessTokenClaims): Promise<AuthenticatedIdentity> {
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

    const identity = await this.sessionRepository.validateAccessIdentity(
      {
        userId: claims.sub,
        membershipId: claims.mid,
        tenantId: claims.tid,
        sessionId: claims.sid,
      },
      claims.jti,
    );

    if (!identity) {
      throw new UnauthorizedException('Authentication required');
    }
    return identity;
  }
}
