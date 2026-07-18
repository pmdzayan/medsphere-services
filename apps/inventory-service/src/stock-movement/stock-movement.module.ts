import { Module } from '@nestjs/common';
import { StockMovementRepository } from './stock-movement.repository';
import { StockMovementService } from './stock-movement.service';
import { StockMovementController } from './stock-movement.controller';
import { BatchModule } from '../batch/batch.module';
import { InventoryModule } from '../inventory/inventory.module';
import { InventoryHistoryModule } from '../inventory-history/inventory-history.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [BatchModule, InventoryModule, InventoryHistoryModule, PrismaModule],
  controllers: [StockMovementController],
  providers: [StockMovementRepository, StockMovementService],
  exports: [StockMovementRepository, StockMovementService],
})
export class StockMovementModule {}
