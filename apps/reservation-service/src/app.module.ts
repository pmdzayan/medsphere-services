import { Module } from '@nestjs/common';
import { HealthModule } from '@medsphere/common';
import { PrismaModule } from './prisma/prisma.module';
import { HealthVaultModule } from './health-vault/health-vault.module';

@Module({
  imports: [HealthModule, PrismaModule, HealthVaultModule],
})
export class AppModule {}
