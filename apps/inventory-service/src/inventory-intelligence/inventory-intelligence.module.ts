import { Module } from '@nestjs/common';
import { InventoryIntelligenceService } from './inventory-intelligence.service';
import { InventoryIntelligenceController } from './inventory-intelligence.controller';
import { InventoryModule } from '../inventory/inventory.module';

@Module({
  imports: [InventoryModule],
  controllers: [InventoryIntelligenceController],
  providers: [InventoryIntelligenceService],
  exports: [InventoryIntelligenceService],
})
export class InventoryIntelligenceModule {}
