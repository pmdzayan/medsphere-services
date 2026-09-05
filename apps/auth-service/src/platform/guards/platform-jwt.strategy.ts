import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { AuthConfigService } from '../../auth/auth-config.service';
import { PlatformSessionRepository } from '../platform-session.repository';
import { PlatformAccessTokenClaims, PlatformAuthenticatedIdentity } from '../platform.types';
import {
  assertValidPlatformAccessTokenClaims,
  hasExpectedPlatformAccessTokenHeader,
} from '../platform-access-token.validation';

@Injectable()
export class PlatformJwtStrategy extends PassportStrategy(Strategy, 'platform-jwt') {
  constructor(
    authConfig: AuthConfigService,
    private readonly platformSessions: PlatformSessionRepository,
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
        if (!hasExpectedPlatformAccessTokenHeader(rawToken, configuration.keyId)) {
          done(new Error('Invalid platform access-token header'));
          return;
        }
        done(null, configuration.publicKeyPem);
      },
    });
  }

  async validate(claims: PlatformAccessTokenClaims): Promise<PlatformAuthenticatedIdentity> {
    assertValidPlatformAccessTokenClaims(claims);

    const identity = await this.platformSessions.validatePlatformAccessIdentity(
      {
        userId: claims.sub,
        platformAccountId: claims.paid,
        platformSessionId: claims.psid,
        securityVersion: claims.sv,
      },
      claims.jti,
    );

    if (!identity) {
      throw new UnauthorizedException('Authentication required');
    }
    return identity;
  }
}
