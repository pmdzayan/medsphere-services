import { Module } from '@nestjs/common';
import { FefoService } from './fefo.service';
import { FefoController } from './fefo.controller';
import { InventoryModule } from '../inventory/inventory.module';
import { BatchModule } from '../batch/batch.module';
import { StockMovementModule } from '../stock-movement/stock-movement.module';
import { InventoryHistoryModule } from '../inventory-history/inventory-history.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [
    InventoryModule,
    BatchModule,
    StockMovementModule,
    InventoryHistoryModule,
    PrismaModule,
  ],
  controllers: [FefoController],
  providers: [FefoService],
  exports: [FefoService],
})
export class FefoModule {}
