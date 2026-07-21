import { Module } from '@nestjs/common';
import { HealthModule } from '@medsphere/common';
import { PrismaModule } from './prisma/prisma.module';
import { BillingModule } from './billing/billing.module';

@Module({
  imports: [HealthModule, PrismaModule, BillingModule],
})
export class AppModule {}
