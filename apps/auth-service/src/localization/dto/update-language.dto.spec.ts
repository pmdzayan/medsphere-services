import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ENABLED_UI_LANGUAGES } from '@medsphere/i18n';
import { UpdateLanguageDto } from './update-language.dto';

describe('UpdateLanguageDto', () => {
  it.each(ENABLED_UI_LANGUAGES)('accepts the complete UI locale %s', async (preferredLanguage) => {
    const dto = plainToInstance(UpdateLanguageDto, { preferredLanguage });
    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it.each(['hi', 'te', 'kn', 'ar', '', 'EN'])(
    'rejects the incomplete or unsupported UI locale %s',
    async (preferredLanguage) => {
      const dto = plainToInstance(UpdateLanguageDto, { preferredLanguage });
      await expect(validate(dto)).resolves.not.toHaveLength(0);
    },
  );

  it('rejects client-supplied user or tenant authority', async () => {
    const dto = plainToInstance(UpdateLanguageDto, {
      preferredLanguage: 'en',
      userId: 'client-controlled',
      tenantId: 'client-controlled',
    });
    const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
    expect(errors.map(({ property }) => property)).toEqual(
      expect.arrayContaining(['userId', 'tenantId']),
    );
  });
});
