import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { HealthVaultRepository } from './health-vault.repository';
import { HealthVaultService } from './health-vault.service';
import { HealthVaultController } from './health-vault.controller';
import { LocalStorageProvider } from './storage/local-storage.provider';

@Module({
  imports: [
    MulterModule.register({
      limits: {
        fileSize: 20 * 1024 * 1024, // 20 MB
      },
    }),
  ],
  controllers: [HealthVaultController],
  providers: [
    HealthVaultRepository,
    HealthVaultService,
    {
      provide: 'STORAGE_PROVIDER',
      useClass: LocalStorageProvider,
    },
  ],
  exports: [HealthVaultRepository, HealthVaultService],
})
export class HealthVaultModule {}
