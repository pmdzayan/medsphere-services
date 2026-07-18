import { Module } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';
import { InventoryModule } from '../inventory/inventory.module';
import { BatchModule } from '../batch/batch.module';
import { ExpiryModule } from '../expiry/expiry.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [InventoryModule, BatchModule, ExpiryModule, PrismaModule],
  controllers: [DashboardController],
  providers: [DashboardService],
  exports: [DashboardService],
})
export class DashboardModule {}
