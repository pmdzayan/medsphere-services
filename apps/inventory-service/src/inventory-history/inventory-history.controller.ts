import { Controller, Get, Query } from '@nestjs/common';
import { InventoryHistoryRepository } from './inventory-history.repository';
import { InventoryHistoryResponseDto } from './dto/inventory-history-response.dto';

@Controller('inventory-history')
export class InventoryHistoryController {
  constructor(private readonly repository: InventoryHistoryRepository) {}

  @Get()
  async findAll(
    @Query('providerId') providerId: string,
    @Query('inventoryId') inventoryId?: string,
    @Query('productId') productId?: string,
    @Query('batchId') batchId?: string,
    @Query('type') type?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<InventoryHistoryResponseDto[]> {
    const records = await this.repository.findByProvider(providerId, {
      inventoryId,
      productId,
      batchId,
      type,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
    return records.map((record: Record<string, unknown>) => {
      const dto = new InventoryHistoryResponseDto();
      dto.id = record.id as string;
      dto.inventoryId = record.inventoryId as string;
      dto.providerId = record.providerId as string;
      dto.productId = record.productId as string;
      dto.batchId = (record.batchId as string) ?? null;
      dto.type = record.type as string;
      dto.quantity = record.quantity as number;
      dto.quantityBefore = record.quantityBefore as number;
      dto.quantityAfter = record.quantityAfter as number;
      dto.referenceType = (record.referenceType as string) ?? null;
      dto.referenceId = (record.referenceId as string) ?? null;
      dto.reason = (record.reason as string) ?? null;
      dto.notes = (record.notes as string) ?? null;
      dto.userId = record.userId as string;
      dto.createdAt =
        record.createdAt instanceof Date
          ? (record.createdAt as Date).toISOString()
          : (record.createdAt as string);
      return dto;
    });
  }
}
