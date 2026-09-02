import { BadRequestException, ValidationPipe } from '@nestjs/common';

import { UnlockSessionDto } from './unlock-session.dto';

const pipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

const refreshToken =
  'msr.00000000-0000-4000-8000-000000000001.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

describe('UnlockSessionDto', () => {
  it('accepts password-only credential proof', async () => {
    await expect(
      pipe.transform(
        {
          password: 'correct-password-123',
          refreshToken,
        },
        { type: 'body', metatype: UnlockSessionDto },
      ),
    ).resolves.toBeInstanceOf(UnlockSessionDto);
  });

  it('accepts Google-only credential proof', async () => {
    await expect(
      pipe.transform(
        {
          googleIdToken: 'verified-google-id-token',
          refreshToken,
        },
        { type: 'body', metatype: UnlockSessionDto },
      ),
    ).resolves.toBeInstanceOf(UnlockSessionDto);
  });

  it('rejects a request with no credential proof', async () => {
    await expect(
      pipe.transform({ refreshToken }, { type: 'body', metatype: UnlockSessionDto }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects conflicting password and Google credential proofs', async () => {
    await expect(
      pipe.transform(
        {
          password: 'correct-password-123',
          googleIdToken: 'verified-google-id-token',
          refreshToken,
        },
        { type: 'body', metatype: UnlockSessionDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
