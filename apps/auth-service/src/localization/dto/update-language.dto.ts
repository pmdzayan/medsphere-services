import { IsString, IsIn } from 'class-validator';
import { ENABLED_UI_LANGUAGES } from '@medsphere/i18n';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateLanguageDto {
  @ApiProperty({ example: 'en', enum: ENABLED_UI_LANGUAGES })
  @IsString()
  @IsIn(ENABLED_UI_LANGUAGES as unknown as string[], {
    message: `Language must be one of: ${ENABLED_UI_LANGUAGES.join(', ')}`,
  })
  preferredLanguage!: string;
}

export class LanguageUpdateResponseDto {
  @ApiProperty()
  message!: string;
}
