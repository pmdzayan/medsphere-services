import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { AuthConfigService } from './auth-config.service';
import { SessionRepository } from './session.repository';
import { AccessTokenClaims, AuthenticatedIdentity } from './auth.types';
import {
  assertValidAccessTokenClaims,
  hasExpectedAccessTokenHeader,
} from './access-token.validation';

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
        if (!hasExpectedAccessTokenHeader(rawToken, configuration.keyId)) {
          done(new Error('Invalid access-token header'));
          return;
        }
        done(null, configuration.publicKeyPem);
      },
    });
  }

  async validate(claims: AccessTokenClaims): Promise<AuthenticatedIdentity> {
    assertValidAccessTokenClaims(claims);

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
