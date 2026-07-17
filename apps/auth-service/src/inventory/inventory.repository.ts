import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface InventoryFindAllParams {
  providerId: string;
  category?: string;
  inStock?: boolean;
  nearExpiry?: boolean;
  search?: string;
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
      },
    });
  }

  async findAll(params: InventoryFindAllParams) {
    const where: Record<string, unknown> = {
      providerId: params.providerId,
      deletedAt: null,
    };

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
}
