import { IsString, IsIn } from 'class-validator';
import { SUPPORTED_LANGUAGES } from '@medsphere/i18n';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateLanguageDto {
  @ApiProperty({ example: 'en', enum: SUPPORTED_LANGUAGES })
  @IsString()
  @IsIn(SUPPORTED_LANGUAGES as unknown as string[], {
    message: `Language must be one of: ${SUPPORTED_LANGUAGES.join(', ')}`,
  })
  preferredLanguage!: string;
}

export class LanguageUpdateResponseDto {
  @ApiProperty()
  message!: string;
}
