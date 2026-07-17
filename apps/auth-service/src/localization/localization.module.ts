import { Module } from '@nestjs/common';
import { I18nService } from '@medsphere/i18n';
import { LocalizationService } from './localization.service';
import { LocalizationController } from './localization.controller';

@Module({
  imports: [],
  controllers: [LocalizationController],
  providers: [
    LocalizationService,
    {
      provide: I18nService,
      useValue: new I18nService(),
    },
  ],
  exports: [LocalizationService, I18nService],
})
export class LocalizationModule {}
