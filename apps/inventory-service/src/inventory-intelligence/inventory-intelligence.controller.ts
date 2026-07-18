import { Controller, Get, Param } from '@nestjs/common';
import { InventoryIntelligenceService } from './inventory-intelligence.service';
import { InventoryIntelligenceResult } from '../common/interfaces';

@Controller('inventory-intelligence')
export class InventoryIntelligenceController {
  constructor(private readonly service: InventoryIntelligenceService) {}

  @Get('analyze/:providerId')
  async analyze(@Param('providerId') providerId: string): Promise<InventoryIntelligenceResult[]> {
    return this.service.analyze(providerId);
  }

  @Get('low-stock/:providerId')
  async getLowStock(
    @Param('providerId') providerId: string,
  ): Promise<InventoryIntelligenceResult[]> {
    return this.service.getLowStockItems(providerId);
  }

  @Get('overstock/:providerId')
  async getOverstock(
    @Param('providerId') providerId: string,
  ): Promise<InventoryIntelligenceResult[]> {
    return this.service.getOverstockItems(providerId);
  }

  @Get('fast-moving/:providerId')
  async getFastMoving(
    @Param('providerId') providerId: string,
  ): Promise<InventoryIntelligenceResult[]> {
    return this.service.getFastMovingItems(providerId);
  }

  @Get('slow-moving/:providerId')
  async getSlowMoving(
    @Param('providerId') providerId: string,
  ): Promise<InventoryIntelligenceResult[]> {
    return this.service.getSlowMovingItems(providerId);
  }

  @Get('dead-stock/:providerId')
  async getDeadStock(
    @Param('providerId') providerId: string,
  ): Promise<InventoryIntelligenceResult[]> {
    return this.service.getDeadStockItems(providerId);
  }
}
