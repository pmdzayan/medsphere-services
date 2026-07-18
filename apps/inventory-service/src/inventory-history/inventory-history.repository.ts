import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StockMovementType } from '../common/enums';

@Injectable()
export class InventoryHistoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: {
    inventoryId: string;
    providerId: string;
    productId: string;
    batchId?: string;
    type: StockMovementType;
    quantity: number;
    quantityBefore: number;
    quantityAfter: number;
    referenceType?: string;
    referenceId?: string;
    reason?: string;
    notes?: string;
    userId: string;
  }) {
    return this.prisma.client.inventoryHistory.create({
      data: {
        inventoryId: data.inventoryId,
        providerId: data.providerId,
        productId: data.productId,
        batchId: data.batchId,
        type: data.type,
        quantity: data.quantity,
        quantityBefore: data.quantityBefore,
        quantityAfter: data.quantityAfter,
        referenceType: data.referenceType,
        referenceId: data.referenceId,
        reason: data.reason,
        notes: data.notes,
        userId: data.userId,
      },
    });
  }

  async findByProvider(
    providerId: string,
    params: {
      inventoryId?: string;
      productId?: string;
      batchId?: string;
      type?: string;
      limit?: number;
      offset?: number;
    },
  ) {
    const where: Record<string, unknown> = { providerId };

    if (params.inventoryId) where.inventoryId = params.inventoryId;
    if (params.productId) where.productId = params.productId;
    if (params.batchId) where.batchId = params.batchId;
    if (params.type) where.type = params.type;

    return this.prisma.client.inventoryHistory.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: params.limit ?? 50,
      skip: params.offset ?? 0,
    });
  }

  async countByProvider(providerId: string): Promise<number> {
    return this.prisma.client.inventoryHistory.count({
      where: { providerId },
    });
  }
}
