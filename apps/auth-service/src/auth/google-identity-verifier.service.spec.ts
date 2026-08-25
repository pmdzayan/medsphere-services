import { UnauthorizedException } from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';

import { AuthConfigService } from './auth-config.service';
import { GoogleIdentityVerifierService } from './google-identity-verifier.service';

describe('GoogleIdentityVerifierService', () => {
  const clientId = 'test-client.apps.googleusercontent.com';

  let verifyIdToken: jest.Mock;
  let service: GoogleIdentityVerifierService;

  beforeEach(() => {
    verifyIdToken = jest.fn();

    const authConfig = {
      value: {
        googleOAuthClientId: clientId,
      },
    } as AuthConfigService;

    service = new GoogleIdentityVerifierService(authConfig);

    (
      service as unknown as {
        client: Pick<OAuth2Client, 'verifyIdToken'>;
      }
    ).client = {
      verifyIdToken,
    };
  });

  it('accepts a valid verified Google identity', async () => {
    verifyIdToken.mockResolvedValue({
      getPayload: () => ({
        sub: 'google-subject-123',
        email: 'User@Example.com',
        email_verified: true,
      }),
    });

    await expect(service.verify('valid-token')).resolves.toEqual({
      subject: 'google-subject-123',
      email: 'user@example.com',
      emailVerified: true,
    });

    expect(verifyIdToken).toHaveBeenCalledWith({
      idToken: 'valid-token',
      audience: clientId,
    });
  });

  it.each([
    ['missing subject', { email: 'user@example.com', email_verified: true }],
    ['missing email', { sub: 'google-subject-123', email_verified: true }],
    [
      'unverified email',
      {
        sub: 'google-subject-123',
        email: 'user@example.com',
        email_verified: false,
      },
    ],
  ])('rejects %s', async (_name, payload) => {
    verifyIdToken.mockResolvedValue({
      getPayload: () => payload,
    });

    await expect(service.verify('invalid-token')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a token rejected by Google verification', async () => {
    verifyIdToken.mockRejectedValue(new Error('invalid signature'));

    await expect(service.verify('tampered-token')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an empty token before contacting Google', async () => {
    await expect(service.verify('   ')).rejects.toBeInstanceOf(UnauthorizedException);

    expect(verifyIdToken).not.toHaveBeenCalled();
  });
});
