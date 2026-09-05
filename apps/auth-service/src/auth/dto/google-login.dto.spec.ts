import { BadRequestException, ValidationPipe } from '@nestjs/common';

import { GoogleLoginDto } from './google-login.dto';
import { SelectGoogleOrganizationLoginDto } from './select-google-organization-login.dto';

const pipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

const membershipId = '00000000-0000-4000-8000-000000000001';

describe('Google login DTOs', () => {
  it('accepts identity-first login without an organization locator', async () => {
    await expect(
      pipe.transform(
        { idToken: 'verified-google-id-token' },
        { type: 'body', metatype: GoogleLoginDto },
      ),
    ).resolves.toBeInstanceOf(GoogleLoginDto);
  });

  it('rejects the legacy tenant-bound login shape', async () => {
    await expect(
      pipe.transform(
        { idToken: 'verified-google-id-token', tenantSlug: 'central-pharmacy' },
        { type: 'body', metatype: GoogleLoginDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requires both Google proof and a valid membership for selection', async () => {
    await expect(
      pipe.transform(
        { idToken: 'verified-google-id-token', membershipId },
        { type: 'body', metatype: SelectGoogleOrganizationLoginDto },
      ),
    ).resolves.toBeInstanceOf(SelectGoogleOrganizationLoginDto);

    await expect(
      pipe.transform(
        { membershipId },
        { type: 'body', metatype: SelectGoogleOrganizationLoginDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
