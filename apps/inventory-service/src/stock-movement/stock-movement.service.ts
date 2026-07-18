import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { StockMovementRepository } from './stock-movement.repository';
import { CreateStockMovementDto } from './dto/create-stock-movement.dto';
import { StockMovementResponseDto } from './dto/stock-movement-response.dto';
import { BatchRepository } from '../batch/batch.repository';
import { InventoryRepository } from '../inventory/inventory.repository';
import { InventoryHistoryRepository } from '../inventory-history/inventory-history.repository';
import { PrismaService } from '../prisma/prisma.service';
import { StockMovementType, BatchStatus } from '../common/enums';

@Injectable()
export class StockMovementService {
  constructor(
    private readonly movementRepository: StockMovementRepository,
    private readonly batchRepository: BatchRepository,
    private readonly inventoryRepository: InventoryRepository,
    private readonly historyRepository: InventoryHistoryRepository,
    private readonly prisma: PrismaService,
  ) {}

  async create(dto: CreateStockMovementDto): Promise<StockMovementResponseDto> {
    // Validate inventory exists
    const inventory = await this.inventoryRepository.findById(dto.inventoryId);
    if (!inventory || inventory.deletedAt) {
      throw new NotFoundException('Inventory record not found');
    }

    // Validate product matches inventory
    if (dto.productId && dto.productId !== inventory.productId) {
      throw new BadRequestException('Product does not match inventory record');
    }

    // Validate batch if provided
    let batch = null;
    if (dto.batchId) {
      batch = await this.batchRepository.findById(dto.batchId);
      if (!batch || batch.deletedAt) {
        throw new NotFoundException('Batch not found');
      }

      // Expired batches cannot be used for STOCK_OUT
      if (dto.type === StockMovementType.STOCK_OUT && batch.status === BatchStatus.EXPIRED) {
        throw new BadRequestException('Cannot perform STOCK_OUT on an expired batch');
      }

      // Validate batch belongs to same product
      if (batch.productId !== inventory.productId) {
        throw new BadRequestException('Batch does not belong to the same product');
      }
    }

    // Calculate quantity before and after based on movement type
    const currentQuantity = inventory.quantity;
    let quantityAfter: number;
    let quantity: number;

    switch (dto.type) {
      case StockMovementType.STOCK_IN:
      case StockMovementType.RETURN_IN:
        quantity = dto.quantity;
        quantityAfter = currentQuantity + quantity;
        break;

      case StockMovementType.STOCK_OUT:
      case StockMovementType.RETURN_OUT:
      case StockMovementType.EXPIRED:
      case StockMovementType.DAMAGED:
        quantity = dto.quantity;
        quantityAfter = currentQuantity - quantity;
        if (quantityAfter < 0) {
          throw new BadRequestException(
            `Stock underflow: insufficient quantity (${currentQuantity}) for movement of ${quantity}`,
          );
        }
        break;

      case StockMovementType.ADJUSTMENT:
        // For adjustment, quantity represents the delta (positive or negative)
        quantity = dto.quantity;
        quantityAfter = currentQuantity + quantity;
        if (quantityAfter < 0) {
          throw new BadRequestException(
            `Invalid adjustment: would result in negative stock (current: ${currentQuantity}, adjustment: ${quantity})`,
          );
        }
        break;

      default:
        throw new BadRequestException(`Invalid movement type: ${dto.type}`);
    }

    // Execute all operations in a transaction
    const record = await this.prisma.client.$transaction(async () => {
      // 1. Create the movement record
      const movement = await this.movementRepository.create({
        inventoryId: dto.inventoryId,
        batchId: dto.batchId,
        providerId: dto.providerId,
        productId: inventory.productId,
        type: dto.type,
        quantity,
        quantityBefore: currentQuantity,
        quantityAfter,
        referenceType: dto.referenceType,
        referenceId: dto.referenceId,
        reason: dto.reason,
        notes: dto.notes,
        userId: dto.userId,
      });

      // 2. Update inventory quantity
      await this.inventoryRepository.update(dto.inventoryId, {
        quantity: quantityAfter,
        inStock: quantityAfter > 0,
      });

      // 3. Update batch current quantity if batch is linked
      if (dto.batchId && batch) {
        const batchDelta =
          dto.type === StockMovementType.STOCK_IN || dto.type === StockMovementType.RETURN_IN
            ? quantity
            : -quantity;
        const newBatchQuantity = Math.max(0, batch.currentQuantity + batchDelta);
        const batchStatus =
          newBatchQuantity <= 0
            ? BatchStatus.EXHAUSTED
            : batch.expiryDate < new Date()
              ? BatchStatus.EXPIRED
              : BatchStatus.ACTIVE;

        await this.batchRepository.update(dto.batchId, {
          currentQuantity: newBatchQuantity,
          status: batchStatus,
        });
      }

      // 4. Record immutable history entry
      await this.historyRepository.create({
        inventoryId: dto.inventoryId,
        providerId: dto.providerId,
        productId: inventory.productId,
        batchId: dto.batchId,
        type: dto.type,
        quantity,
        quantityBefore: currentQuantity,
        quantityAfter,
        referenceType: dto.referenceType,
        referenceId: dto.referenceId,
        reason: dto.reason,
        notes: dto.notes,
        userId: dto.userId,
      });

      return movement;
    });

    return this.toResponseDto(record);
  }

  async findById(id: string): Promise<StockMovementResponseDto> {
    const record = await this.movementRepository.findById(id);
    if (!record || record.deletedAt) {
      throw new NotFoundException('Stock movement not found');
    }
    return this.toResponseDto(record);
  }

  async findAll(params: {
    providerId: string;
    inventoryId?: string;
    batchId?: string;
    productId?: string;
    type?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
  }) {
    const result = await this.movementRepository.findAll(params);
    return {
      data: result.data
        .filter((record: Record<string, unknown>) => !record.deletedAt)
        .map((record: Record<string, unknown>) => this.toResponseDto(record)),
      total: result.total,
      limit: result.limit,
      offset: result.offset,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private toResponseDto(record: any): StockMovementResponseDto {
    const dto = new StockMovementResponseDto();
    dto.id = record.id;
    dto.inventoryId = record.inventoryId;
    dto.batchId = record.batchId ?? null;
    dto.providerId = record.providerId;
    dto.productId = record.productId;
    dto.type = record.type;
    dto.quantity = record.quantity;
    dto.quantityBefore = record.quantityBefore;
    dto.quantityAfter = record.quantityAfter;
    dto.referenceType = record.referenceType ?? null;
    dto.referenceId = record.referenceId ?? null;
    dto.reason = record.reason ?? null;
    dto.notes = record.notes ?? null;
    dto.userId = record.userId;
    dto.createdAt =
      record.createdAt instanceof Date ? record.createdAt.toISOString() : record.createdAt;
    return dto;
  }
}
