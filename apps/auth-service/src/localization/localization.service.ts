import { Injectable } from '@nestjs/common';
import { I18nService } from '@medsphere/i18n';

@Injectable()
export class LocalizationService {
  constructor(private readonly i18n: I18nService) {}

  /**
   * Returns all supported languages with display names.
   */
  getSupportedLanguages(): Array<{ code: string; name: string }> {
    return this.i18n.getSupportedLanguages();
  }

  /**
   * Translates a key with optional parameters.
   */
  translate(key: string, lang: string, params?: Record<string, string | number>): string {
    return this.i18n.translate(key, lang, params);
  }
}
