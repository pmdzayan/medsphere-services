import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface InventoryFindAllParams {
  providerId: string;
  productId?: string;
  category?: string;
  inStock?: boolean;
  nearExpiry?: boolean;
  search?: string;
  lowStock?: boolean;
}

@Injectable()
export class InventoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: {
    providerId: string;
    productId: string;
    sku?: string;
    batchNumber: string;
    expiryDate: Date;
    quantity: number;
    reservedQuantity: number;
    sellingPrice: number;
    mrp: number;
    discountPercentage: number;
    taxPercentage: number;
    minimumStockLevel: number;
    inStock: boolean;
  }) {
    return this.prisma.client.inventory.create({
      data: {
        providerId: data.providerId,
        productId: data.productId,
        sku: data.sku,
        batchNumber: data.batchNumber,
        expiryDate: data.expiryDate,
        quantity: data.quantity,
        reservedQuantity: data.reservedQuantity,
        sellingPrice: data.sellingPrice,
        mrp: data.mrp,
        discountPercentage: data.discountPercentage,
        taxPercentage: data.taxPercentage,
        minimumStockLevel: data.minimumStockLevel,
        inStock: data.inStock,
      },
      include: {
        product: true,
      },
    });
  }

  async findById(id: string) {
    return this.prisma.client.inventory.findUnique({
      where: { id },
      include: {
        product: true,
        stockMovements: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });
  }

  async findAll(params: InventoryFindAllParams) {
    const where: Record<string, unknown> = {
      providerId: params.providerId,
      deletedAt: null,
    };

    if (params.productId) {
      where.productId = params.productId;
    }

    if (params.inStock !== undefined) {
      where.inStock = params.inStock;
    }

    if (params.nearExpiry) {
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
      where.expiryDate = {
        lte: thirtyDaysFromNow,
        gte: new Date(),
      };
    }

    if (params.lowStock) {
      // Low stock items: quantity > 0 AND quantity <= minimumStockLevel
      // We'll filter post-query since Prisma doesn't support column comparison natively
    }

    if (params.category) {
      where.product = {
        category: params.category,
      };
    }

    if (params.search) {
      where.product = {
        ...((where.product as Record<string, unknown>) || {}),
        OR: [
          { name: { contains: params.search, mode: 'insensitive' } },
          { brand: { contains: params.search, mode: 'insensitive' } },
          { barcode: { contains: params.search, mode: 'insensitive' } },
        ],
      };
    }

    return this.prisma.client.inventory.findMany({
      where,
      include: {
        product: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async update(
    id: string,
    data: {
      productId?: string;
      sku?: string;
      batchNumber?: string;
      expiryDate?: Date;
      quantity?: number;
      reservedQuantity?: number;
      sellingPrice?: number;
      mrp?: number;
      discountPercentage?: number;
      taxPercentage?: number;
      minimumStockLevel?: number;
      inStock?: boolean;
      isVisible?: boolean;
    },
  ) {
    return this.prisma.client.inventory.update({
      where: { id },
      data,
      include: {
        product: true,
      },
    });
  }

  async softDelete(id: string) {
    return this.prisma.client.inventory.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async countByProvider(providerId: string): Promise<number> {
    return this.prisma.client.inventory.count({
      where: { providerId, deletedAt: null },
    });
  }

  async countOutOfStock(providerId: string): Promise<number> {
    return this.prisma.client.inventory.count({
      where: { providerId, inStock: false, deletedAt: null },
    });
  }

  async countLowStock(providerId: string): Promise<number> {
    const items = await this.prisma.client.inventory.findMany({
      where: { providerId, deletedAt: null, inStock: true },
      select: { quantity: true, minimumStockLevel: true },
    });
    return items.filter((item) => item.quantity <= item.minimumStockLevel).length;
  }

  async getInventoryValue(providerId: string): Promise<number> {
    const items = await this.prisma.client.inventory.findMany({
      where: { providerId, deletedAt: null },
      select: { quantity: true, sellingPrice: true },
    });
    return items.reduce((total, item) => total + item.quantity * Number(item.sellingPrice), 0);
  }

  /**
   * FEFO: Get batches for a product ordered by expiry date (nearest first),
   * skipping expired and exhausted batches.
   */
  async findFefoBatches(providerId: string, productId: string, quantityNeeded: number) {
    const batches = await this.prisma.client.batch.findMany({
      where: {
        providerId,
        productId,
        status: 'ACTIVE',
        expiryDate: { gt: new Date() },
        currentQuantity: { gt: 0 },
        deletedAt: null,
      },
      orderBy: { expiryDate: 'asc' },
    });

    const selected: Array<{ batchId: string; quantity: number }> = [];
    let remaining = quantityNeeded;

    for (const batch of batches) {
      if (remaining <= 0) break;
      const take = Math.min(batch.currentQuantity, remaining);
      selected.push({ batchId: batch.id, quantity: take });
      remaining -= take;
    }

    return { batches: selected, fulfilled: remaining <= 0 };
  }
}
