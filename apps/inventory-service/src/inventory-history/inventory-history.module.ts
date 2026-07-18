import { Module } from '@nestjs/common';
import { InventoryHistoryRepository } from './inventory-history.repository';
import { InventoryHistoryController } from './inventory-history.controller';

@Module({
  controllers: [InventoryHistoryController],
  providers: [InventoryHistoryRepository],
  exports: [InventoryHistoryRepository],
})
export class InventoryHistoryModule {}
