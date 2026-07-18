import { Module } from '@nestjs/common';
import { HealthModule } from '@medsphere/common';
import { PrismaModule } from './prisma/prisma.module';
import { BatchModule } from './batch/batch.module';
import { StockMovementModule } from './stock-movement/stock-movement.module';
import { InventoryModule } from './inventory/inventory.module';
import { InventoryHistoryModule } from './inventory-history/inventory-history.module';
import { ExpiryModule } from './expiry/expiry.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { InventoryIntelligenceModule } from './inventory-intelligence/inventory-intelligence.module';
import { FefoModule } from './fefo/fefo.module';
import { AvailabilityModule } from './availability/availability.module';
import { SearchModule } from './search/search.module';
import { NearbyModule } from './nearby/nearby.module';

@Module({
  imports: [
    HealthModule,
    PrismaModule,
    BatchModule,
    StockMovementModule,
    InventoryModule,
    InventoryHistoryModule,
    ExpiryModule,
    DashboardModule,
    InventoryIntelligenceModule,
    FefoModule,
    AvailabilityModule,
    SearchModule,
    NearbyModule,
  ],
})
export class AppModule {}
