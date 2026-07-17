import { Controller, Get } from '@nestjs/common';
import { LocalizationService } from './localization.service';

@Controller('localization')
export class LocalizationController {
  constructor(private readonly localizationService: LocalizationService) {}

  /**
   * GET /localization/languages
   * Returns all supported languages with their display names.
   */
  @Get('languages')
  getSupportedLanguages(): Array<{ code: string; name: string }> {
    return this.localizationService.getSupportedLanguages();
  }
}
