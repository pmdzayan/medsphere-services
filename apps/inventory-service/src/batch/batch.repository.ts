import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BatchStatus } from '../common/enums';

export interface BatchFindAllParams {
  providerId: string;
  productId?: string;
  status?: string;
  nearExpiry?: boolean;
  expired?: boolean;
}

@Injectable()
export class BatchRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: {
    providerId: string;
    productId: string;
    batchNumber: string;
    manufacturingDate?: Date;
    expiryDate: Date;
    initialQuantity: number;
    currentQuantity: number;
    purchasePrice: number;
    sellingPrice: number;
    status: BatchStatus;
  }) {
    return this.prisma.client.batch.create({
      data: {
        providerId: data.providerId,
        productId: data.productId,
        batchNumber: data.batchNumber,
        manufacturingDate: data.manufacturingDate,
        expiryDate: data.expiryDate,
        initialQuantity: data.initialQuantity,
        currentQuantity: data.currentQuantity,
        purchasePrice: data.purchasePrice,
        sellingPrice: data.sellingPrice,
        status: data.status,
      },
      include: {
        product: true,
      },
    });
  }

  async findById(id: string) {
    return this.prisma.client.batch.findUnique({
      where: { id },
      include: {
        product: true,
      },
    });
  }

  async findAll(params: BatchFindAllParams) {
    const where: Record<string, unknown> = {
      providerId: params.providerId,
      deletedAt: null,
    };

    if (params.productId) {
      where.productId = params.productId;
    }

    if (params.status) {
      where.status = params.status;
    }

    if (params.expired) {
      where.expiryDate = { lt: new Date() };
      where.status = { not: BatchStatus.EXHAUSTED };
    }

    if (params.nearExpiry) {
      const now = new Date();
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
      where.expiryDate = {
        gte: now,
        lte: thirtyDaysFromNow,
      };
      where.status = BatchStatus.ACTIVE;
    }

    return this.prisma.client.batch.findMany({
      where,
      include: {
        product: true,
      },
      orderBy: { expiryDate: 'asc' },
    });
  }

  async findActiveBatchesByProduct(providerId: string, productId: string) {
    return this.prisma.client.batch.findMany({
      where: {
        providerId,
        productId,
        status: BatchStatus.ACTIVE,
        expiryDate: { gt: new Date() },
        currentQuantity: { gt: 0 },
        deletedAt: null,
      },
      orderBy: { expiryDate: 'asc' },
    });
  }

  /**
   * FEFO-optimized batch query with tie-breaking:
   * 1. Nearest expiry date first
   * 2. Oldest manufacturing date first (if same expiry)
   * 3. Oldest created batch first (if same expiry and mfg date)
   * Only returns ACTIVE, non-expired, non-exhausted batches with quantity > 0.
   */
  async findFefoBatches(providerId: string, productId: string) {
    return this.prisma.client.batch.findMany({
      where: {
        providerId,
        productId,
        status: BatchStatus.ACTIVE,
        expiryDate: { gt: new Date() },
        currentQuantity: { gt: 0 },
        deletedAt: null,
      },
      orderBy: [
        { expiryDate: 'asc' },
        { manufacturingDate: { sort: 'asc', nulls: 'last' } },
        { createdAt: 'asc' },
      ],
    });
  }

  async update(
    id: string,
    data: {
      batchNumber?: string;
      manufacturingDate?: Date;
      expiryDate?: Date;
      currentQuantity?: number;
      purchasePrice?: number;
      sellingPrice?: number;
      status?: BatchStatus;
    },
  ) {
    return this.prisma.client.batch.update({
      where: { id },
      data,
      include: {
        product: true,
      },
    });
  }

  async softDelete(id: string) {
    return this.prisma.client.batch.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async countByProvider(providerId: string): Promise<number> {
    return this.prisma.client.batch.count({
      where: { providerId, deletedAt: null },
    });
  }

  async countExpired(providerId: string): Promise<number> {
    return this.prisma.client.batch.count({
      where: {
        providerId,
        expiryDate: { lt: new Date() },
        status: { not: BatchStatus.EXHAUSTED },
        deletedAt: null,
      },
    });
  }

  async countExpiringSoon(providerId: string, days: number): Promise<number> {
    const now = new Date();
    const future = new Date();
    future.setDate(future.getDate() + days);
    return this.prisma.client.batch.count({
      where: {
        providerId,
        expiryDate: { gte: now, lte: future },
        status: BatchStatus.ACTIVE,
        deletedAt: null,
      },
    });
  }
}
