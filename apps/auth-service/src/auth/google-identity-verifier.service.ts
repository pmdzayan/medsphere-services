import { Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';

import { AuthConfigService } from './auth-config.service';

const INVALID_GOOGLE_IDENTITY_MESSAGE = 'Invalid Google identity';
const GOOGLE_AUTH_UNAVAILABLE_MESSAGE = 'Google authentication is not configured';

export interface VerifiedGoogleIdentity {
  readonly subject: string;
  readonly email: string;
  readonly emailVerified: true;
}

@Injectable()
export class GoogleIdentityVerifierService {
  private readonly client = new OAuth2Client();

  constructor(private readonly authConfig: AuthConfigService) {}

  async verify(idToken: string): Promise<VerifiedGoogleIdentity> {
    const clientId = this.authConfig.value.googleOAuthClientId;

    if (!clientId) {
      throw new ServiceUnavailableException(GOOGLE_AUTH_UNAVAILABLE_MESSAGE);
    }

    if (!idToken.trim()) {
      throw new UnauthorizedException(INVALID_GOOGLE_IDENTITY_MESSAGE);
    }

    try {
      const ticket = await this.client.verifyIdToken({
        idToken,
        audience: clientId,
      });

      const payload = ticket.getPayload();

      if (!payload?.sub || !payload.email || payload.email_verified !== true) {
        throw new UnauthorizedException(INVALID_GOOGLE_IDENTITY_MESSAGE);
      }

      return {
        subject: payload.sub,
        email: payload.email.trim().toLowerCase(),
        emailVerified: true,
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      throw new UnauthorizedException(INVALID_GOOGLE_IDENTITY_MESSAGE);
    }
  }
}
