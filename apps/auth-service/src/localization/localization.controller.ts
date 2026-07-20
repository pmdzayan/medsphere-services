import { Controller, Get } from '@nestjs/common';
import { PublicEndpoint } from '@medsphere/common';
import { ApiOkResponse, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { LocalizationService } from './localization.service';

class SupportedLanguageDto {
  @ApiProperty({ example: 'en' })
  code!: string;

  @ApiProperty({ example: 'English' })
  name!: string;
}

@Controller('localization')
@ApiTags('Localization')
export class LocalizationController {
  constructor(private readonly localizationService: LocalizationService) {}

  /**
   * GET /localization/languages
   * Returns all supported languages with their display names.
   */
  @Get('languages')
  @PublicEndpoint()
  @ApiOperation({ summary: 'List supported language metadata' })
  @ApiOkResponse({ type: SupportedLanguageDto, isArray: true })
  getSupportedLanguages(): Array<{ code: string; name: string }> {
    return this.localizationService.getSupportedLanguages();
  }
}
