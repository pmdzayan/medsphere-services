import { BadRequestException, ValidationPipe } from '@nestjs/common';

import { ReauthenticateSessionDto } from './reauthenticate-session.dto';

const pipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

describe('ReauthenticateSessionDto', () => {
  it('accepts password-only proof', async () => {
    await expect(
      pipe.transform(
        { password: 'correct-password-123' },
        { type: 'body', metatype: ReauthenticateSessionDto },
      ),
    ).resolves.toBeInstanceOf(ReauthenticateSessionDto);
  });

  it('accepts Google-only proof', async () => {
    await expect(
      pipe.transform(
        { googleIdToken: 'verified-google-id-token' },
        { type: 'body', metatype: ReauthenticateSessionDto },
      ),
    ).resolves.toBeInstanceOf(ReauthenticateSessionDto);
  });

  it('rejects missing credential proof', async () => {
    await expect(
      pipe.transform({}, { type: 'body', metatype: ReauthenticateSessionDto }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects both credential mechanisms together', async () => {
    await expect(
      pipe.transform(
        {
          password: 'correct-password-123',
          googleIdToken: 'verified-google-id-token',
        },
        { type: 'body', metatype: ReauthenticateSessionDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects client-provided session authority', async () => {
    await expect(
      pipe.transform(
        {
          password: 'correct-password-123',
          sessionId: '00000000-0000-4000-8000-000000000001',
        },
        { type: 'body', metatype: ReauthenticateSessionDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
