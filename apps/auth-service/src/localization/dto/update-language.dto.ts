import { IsString, IsIn } from 'class-validator';
import { SUPPORTED_LANGUAGES } from '@medsphere/i18n';

export class UpdateLanguageDto {
  @IsString()
  @IsIn(SUPPORTED_LANGUAGES as unknown as string[], {
    message: `Language must be one of: ${SUPPORTED_LANGUAGES.join(', ')}`,
  })
  preferredLanguage!: string;
}
