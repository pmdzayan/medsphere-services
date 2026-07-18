import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StockMovementType } from '../common/enums';

export interface StockMovementFindAllParams {
  providerId: string;
  inventoryId?: string;
  batchId?: string;
  productId?: string;
  type?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
}

@Injectable()
export class StockMovementRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: {
    inventoryId: string;
    batchId?: string;
    providerId: string;
    productId: string;
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
    return this.prisma.client.stockMovement.create({
      data: {
        inventoryId: data.inventoryId,
        batchId: data.batchId,
        providerId: data.providerId,
        productId: data.productId,
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
      include: {
        inventory: {
          include: { product: true },
        },
        batch: true,
      },
    });
  }

  async findById(id: string) {
    return this.prisma.client.stockMovement.findUnique({
      where: { id },
      include: {
        inventory: {
          include: { product: true },
        },
        batch: true,
      },
    });
  }

  async findAll(
    params: StockMovementFindAllParams,
  ): Promise<PaginatedResult<Record<string, unknown>>> {
    const where: Record<string, unknown> = {
      providerId: params.providerId,
      deletedAt: null,
    };

    if (params.inventoryId) where.inventoryId = params.inventoryId;
    if (params.batchId) where.batchId = params.batchId;
    if (params.productId) where.productId = params.productId;
    if (params.type) where.type = params.type;

    // Date range filtering
    if (params.startDate || params.endDate) {
      const createdAtFilter: Record<string, Date> = {};
      if (params.startDate) {
        createdAtFilter.gte = new Date(params.startDate);
      }
      if (params.endDate) {
        createdAtFilter.lte = new Date(params.endDate);
      }
      where.createdAt = createdAtFilter;
    }

    const take = params.limit ?? 50;
    const skip = params.offset ?? 0;

    const [data, total] = await Promise.all([
      this.prisma.client.stockMovement.findMany({
        where,
        include: {
          inventory: {
            include: { product: true },
          },
          batch: true,
        },
        orderBy: { createdAt: 'desc' },
        take,
        skip,
      }),
      this.prisma.client.stockMovement.count({ where }),
    ]);

    return { data: data as unknown as Record<string, unknown>[], total, limit: take, offset: skip };
  }

  async countByProvider(providerId: string): Promise<number> {
    return this.prisma.client.stockMovement.count({
      where: { providerId, deletedAt: null },
    });
  }
}
