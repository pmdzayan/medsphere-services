import { Injectable, BadRequestException } from '@nestjs/common';
import { InventoryRepository } from '../inventory/inventory.repository';
import { BatchRepository } from '../batch/batch.repository';
import { StockMovementRepository } from '../stock-movement/stock-movement.repository';
import { InventoryHistoryRepository } from '../inventory-history/inventory-history.repository';
import { PrismaService } from '../prisma/prisma.service';
import { FefoAllocationDto } from './dto/fefo-allocation.dto';
import { StockMovementType, BatchStatus } from '../common/enums';

export interface FefoPick {
  batchId: string;
  batchNumber: string;
  expiryDate: string;
  manufacturingDate: string | null;
  quantityTaken: number;
  remainingInBatch: number;
  originalBatchQuantity: number;
}

export interface FefoPreviewResult {
  productId: string;
  requestedQuantity: number;
  totalAvailable: number;
  fulfilled: boolean;
  picks: FefoPick[];
}

export interface FefoAllocationResult {
  allocationId: string;
  productId: string;
  requestedQuantity: number;
  totalAllocated: number;
  fulfilled: boolean;
  picks: FefoPick[];
  movements: Array<{
    movementId: string;
    batchId: string;
    quantity: number;
    type: StockMovementType;
  }>;
}

export interface BatchAllocationHistoryEntry {
  movementId: string;
  batchId: string;
  batchNumber: string;
  productId: string;
  quantity: number;
  type: string;
  quantityBefore: number;
  quantityAfter: number;
  createdAt: string;
}

@Injectable()
export class FefoService {
  constructor(
    private readonly inventoryRepository: InventoryRepository,
    private readonly batchRepository: BatchRepository,
    private readonly movementRepository: StockMovementRepository,
    private readonly historyRepository: InventoryHistoryRepository,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Preview FEFO allocation without making any changes.
   * Returns which batches would be picked and in what order.
   */
  async preview(
    providerId: string,
    productId: string,
    quantity?: number,
  ): Promise<FefoPreviewResult> {
    const fefoBatches = await this.batchRepository.findFefoBatches(providerId, productId);

    if (fefoBatches.length === 0) {
      throw new BadRequestException('No available batches for FEFO allocation');
    }

    const totalAvailable = fefoBatches.reduce((sum, b) => sum + b.currentQuantity, 0);

    // If no quantity specified, return the full batch listing
    if (!quantity) {
      return {
        productId,
        requestedQuantity: 0,
        totalAvailable,
        fulfilled: true,
        picks: fefoBatches.map((batch) => ({
          batchId: batch.id,
          batchNumber: batch.batchNumber,
          expiryDate:
            batch.expiryDate instanceof Date
              ? batch.expiryDate.toISOString()
              : new Date(batch.expiryDate as unknown as string).toISOString(),
          manufacturingDate: batch.manufacturingDate
            ? batch.manufacturingDate instanceof Date
              ? batch.manufacturingDate.toISOString()
              : new Date(batch.manufacturingDate as unknown as string).toISOString()
            : null,
          quantityTaken: 0,
          remainingInBatch: batch.currentQuantity,
          originalBatchQuantity: batch.currentQuantity,
        })),
      };
    }

    if (quantity <= 0) {
      throw new BadRequestException('Quantity must be greater than 0');
    }

    if (totalAvailable < quantity) {
      throw new BadRequestException(
        `Insufficient stock. Requested ${quantity}, available ${totalAvailable}`,
      );
    }

    let remaining = quantity;
    const picks: FefoPick[] = [];

    for (const batch of fefoBatches) {
      if (remaining <= 0) break;

      const takeFromBatch = Math.min(batch.currentQuantity, remaining);
      const newBatchQuantity = batch.currentQuantity - takeFromBatch;

      picks.push({
        batchId: batch.id,
        batchNumber: batch.batchNumber,
        expiryDate:
          batch.expiryDate instanceof Date
            ? batch.expiryDate.toISOString()
            : new Date(batch.expiryDate as unknown as string).toISOString(),
        manufacturingDate: batch.manufacturingDate
          ? batch.manufacturingDate instanceof Date
            ? batch.manufacturingDate.toISOString()
            : new Date(batch.manufacturingDate as unknown as string).toISOString()
          : null,
        quantityTaken: takeFromBatch,
        remainingInBatch: newBatchQuantity,
        originalBatchQuantity: batch.currentQuantity,
      });

      remaining -= takeFromBatch;
    }

    return {
      productId,
      requestedQuantity: quantity,
      totalAvailable,
      fulfilled: remaining <= 0,
      picks,
    };
  }

  /**
   * Execute a FEFO allocation:
   * 1. Preview batches to pick using FEFO
   * 2. Deduct from each batch
   * 3. Create stock movement records
   * 4. Update inventory/batch quantities
   * 5. Record inventory history
   * All within a single transaction.
   */
  async allocate(dto: FefoAllocationDto): Promise<FefoAllocationResult> {
    const { providerId, productId, quantity, reason, notes, userId } = dto;

    // Find inventory record
    const inventoryItems = await this.inventoryRepository.findAll({
      providerId,
      productId,
      inStock: true,
    });

    if (inventoryItems.length === 0) {
      throw new BadRequestException('No inventory found for this product');
    }

    const inventory = inventoryItems[0] as Record<string, unknown>;
    const inventoryId = inventory.id as string;
    const inventoryQuantity = (inventory as { quantity?: number }).quantity ?? 0;

    // Get FEFO batches
    const fefoBatches = await this.batchRepository.findFefoBatches(providerId, productId);

    if (fefoBatches.length === 0) {
      throw new BadRequestException('No available batches for FEFO allocation');
    }

    const totalAvailable = fefoBatches.reduce((sum, b) => sum + b.currentQuantity, 0);
    if (totalAvailable < quantity) {
      throw new BadRequestException(
        `Insufficient stock. Requested ${quantity}, available ${totalAvailable}`,
      );
    }

    // Execute allocation within transaction
    const result = await this.prisma.client.$transaction(async () => {
      // 1. Deduct overall inventory quantity
      const inventoryAfter = inventoryQuantity - quantity;
      if (inventoryAfter < 0) {
        throw new BadRequestException(
          `Stock underflow: insufficient inventory quantity (${inventoryQuantity})`,
        );
      }

      await this.inventoryRepository.update(inventoryId, {
        quantity: inventoryAfter,
        inStock: inventoryAfter > 0,
      });

      // 2. Process each batch in FEFO order
      let remaining = quantity;
      const picks: FefoPick[] = [];
      const movements: FefoAllocationResult['movements'] = [];

      for (const batch of fefoBatches) {
        if (remaining <= 0) break;

        const takeFromBatch = Math.min(batch.currentQuantity, remaining);
        const newBatchQuantity = batch.currentQuantity - takeFromBatch;

        // Determine batch status after deduction
        const batchStatus =
          newBatchQuantity <= 0
            ? BatchStatus.EXHAUSTED
            : batch.expiryDate < new Date()
              ? BatchStatus.EXPIRED
              : BatchStatus.ACTIVE;

        // Update batch quantity and status
        await this.batchRepository.update(batch.id, {
          currentQuantity: newBatchQuantity,
          status: batchStatus,
        });

        // Create stock movement record
        const movement = await this.movementRepository.create({
          inventoryId,
          batchId: batch.id,
          providerId,
          productId,
          type: StockMovementType.STOCK_OUT,
          quantity: takeFromBatch,
          quantityBefore: batch.currentQuantity,
          quantityAfter: newBatchQuantity,
          referenceType: reason ? 'FEFO_ALLOCATION' : undefined,
          referenceId: reason ? `FEFO-${Date.now()}` : undefined,
          reason: reason ?? 'FEFO allocation',
          notes: notes ?? undefined,
          userId,
        });

        // Record immutable history entry
        await this.historyRepository.create({
          inventoryId,
          providerId,
          productId,
          batchId: batch.id,
          type: StockMovementType.STOCK_OUT,
          quantity: takeFromBatch,
          quantityBefore: batch.currentQuantity,
          quantityAfter: newBatchQuantity,
          referenceType: reason ? 'FEFO_ALLOCATION' : undefined,
          referenceId: reason ? `FEFO-${Date.now()}` : undefined,
          reason: reason ?? 'FEFO allocation',
          notes: notes ?? undefined,
          userId,
        });

        picks.push({
          batchId: batch.id,
          batchNumber: batch.batchNumber,
          expiryDate:
            batch.expiryDate instanceof Date
              ? batch.expiryDate.toISOString()
              : new Date(batch.expiryDate as unknown as string).toISOString(),
          manufacturingDate: batch.manufacturingDate
            ? batch.manufacturingDate instanceof Date
              ? batch.manufacturingDate.toISOString()
              : new Date(batch.manufacturingDate as unknown as string).toISOString()
            : null,
          quantityTaken: takeFromBatch,
          remainingInBatch: newBatchQuantity,
          originalBatchQuantity: batch.currentQuantity,
        });

        movements.push({
          movementId: movement.id,
          batchId: batch.id,
          quantity: takeFromBatch,
          type: StockMovementType.STOCK_OUT,
        });

        remaining -= takeFromBatch;
      }

      const fulfilled = remaining <= 0;
      return {
        allocationId: `FEFO-${Date.now()}`,
        productId,
        requestedQuantity: quantity,
        totalAllocated: quantity - remaining,
        fulfilled,
        picks,
        movements,
      };
    });

    return result;
  }

  /**
   * Get batch allocation history (stock movements filtered by FEFO type or STOCK_OUT).
   */
  async getAllocationHistory(params: {
    providerId: string;
    productId?: string;
    batchId?: string;
    type?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
  }) {
    return this.movementRepository.findAll({
      providerId: params.providerId,
      productId: params.productId,
      batchId: params.batchId,
      type: params.type ?? StockMovementType.STOCK_OUT,
      startDate: params.startDate,
      endDate: params.endDate,
      limit: params.limit,
      offset: params.offset,
    });
  }
}
