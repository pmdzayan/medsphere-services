import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BatchStatus } from '../common/enums';
import { AVAILABILITY_CONFIG, AvailabilityStatus } from './config/availability.config';

export interface ProductAvailabilityResult {
  productId: string;
  productName: string;
  brand: string;
  category: string;
  genericName: string | null;
  pharmacyId: string;
  pharmacyName: string;
  availableQuantity: number;
  reservedQuantity: number;
  sellableQuantity: number;
  totalBatches: number;
  expiredBatches: number;
  status: AvailabilityStatus;
  minimumStockLevel: number;
}

export interface PharmacyAvailabilityResult {
  pharmacyId: string;
  pharmacyName: string;
  totalProducts: number;
  inStockCount: number;
  lowStockCount: number;
  outOfStockCount: number;
  unavailableCount: number;
}

export interface MedicineAvailabilityResult {
  productId: string;
  productName: string;
  brand: string;
  category: string;
  genericName: string | null;
  pharmacies: Array<{
    pharmacyId: string;
    pharmacyName: string;
    availableQuantity: number;
    reservedQuantity: number;
    sellableQuantity: number;
    status: AvailabilityStatus;
  }>;
  totalAvailableAcrossPharmacies: number;
}

export interface PaginatedAvailabilityResult {
  data: ProductAvailabilityResult[];
  total: number;
  limit: number;
  offset: number;
}

export interface SearchAvailabilityParams {
  providerId?: string;
  productId?: string;
  category?: string;
  brand?: string;
  genericName?: string;
  search?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

@Injectable()
export class AvailabilityService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get availability for a specific product at a specific pharmacy.
   */
  async getProductAvailability(
    providerId: string,
    productId: string,
  ): Promise<ProductAvailabilityResult> {
    const inventoryItems = await this.prisma.client.inventory.findMany({
      where: {
        providerId,
        productId,
        deletedAt: null,
      },
      include: {
        product: true,
        provider: { select: { businessName: true } },
      },
    });

    if (inventoryItems.length === 0) {
      const product = await this.prisma.client.product.findUnique({
        where: { id: productId },
      });
      if (!product) {
        throw new Error(`Product not found: ${productId}`);
      }
      return {
        productId,
        productName: product.name,
        brand: product.brand,
        category: product.category,
        genericName: product.genericName,
        pharmacyId: providerId,
        pharmacyName: 'Unknown',
        availableQuantity: 0,
        reservedQuantity: 0,
        sellableQuantity: 0,
        totalBatches: 0,
        expiredBatches: 0,
        status: AvailabilityStatus.UNAVAILABLE,
        minimumStockLevel: 0,
      };
    }

    const item = inventoryItems[0];
    const totalReserved = inventoryItems.reduce((sum, i) => sum + i.reservedQuantity, 0);

    // Count expired batches for this product at this pharmacy
    const expiredBatches = await this.prisma.client.batch.count({
      where: {
        providerId,
        productId,
        status: BatchStatus.EXPIRED,
        deletedAt: null,
      },
    });

    const totalBatches = await this.prisma.client.batch.count({
      where: {
        providerId,
        productId,
        deletedAt: null,
      },
    });

    // Only ACTIVE inventory is considered available
    const activeItems = inventoryItems.filter((i) => i.inStock && i.quantity > 0);
    const availableQuantity = activeItems.reduce((sum, i) => sum + i.quantity, 0);
    const sellableQuantity = Math.max(0, availableQuantity - totalReserved);

    const status = this.determineStatus(availableQuantity, item.minimumStockLevel);

    return {
      productId,
      productName: item.product.name,
      brand: item.product.brand,
      category: item.product.category,
      genericName: item.product.genericName,
      pharmacyId: providerId,
      pharmacyName: item.provider.businessName,
      availableQuantity,
      reservedQuantity: totalReserved,
      sellableQuantity,
      totalBatches,
      expiredBatches,
      status,
      minimumStockLevel: item.minimumStockLevel,
    };
  }

  /**
   * Get availability summary for an entire pharmacy.
   */
  async getPharmacyAvailability(
    providerId: string,
    params: SearchAvailabilityParams,
  ): Promise<PaginatedAvailabilityResult> {
    const limit = params.limit ?? AVAILABILITY_CONFIG.DEFAULT_PAGE_SIZE;
    const offset = params.offset ?? 0;

    const where: Record<string, unknown> = {
      providerId,
      deletedAt: null,
    };

    if (params.productId) where.productId = params.productId;
    if (params.category) {
      where.product = { category: params.category };
    }
    if (params.search) {
      where.product = {
        ...((where.product as Record<string, unknown>) || {}),
        OR: [
          { name: { contains: params.search, mode: 'insensitive' } },
          { brand: { contains: params.search, mode: 'insensitive' } },
          { genericName: { contains: params.search, mode: 'insensitive' } },
        ],
      };
    }
    if (params.brand) {
      where.product = {
        ...((where.product as Record<string, unknown>) || {}),
        brand: { contains: params.brand, mode: 'insensitive' },
      };
    }
    if (params.genericName) {
      where.product = {
        ...((where.product as Record<string, unknown>) || {}),
        genericName: { contains: params.genericName, mode: 'insensitive' },
      };
    }

    const [inventoryItems, total] = await Promise.all([
      this.prisma.client.inventory.findMany({
        where,
        include: {
          product: true,
          provider: { select: { businessName: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.client.inventory.count({ where }),
    ]);

    // Group by product to get unique product availability
    const productMap = new Map<string, ProductAvailabilityResult>();

    for (const item of inventoryItems) {
      if (!productMap.has(item.productId)) {
        const availableQuantity = item.inStock && item.quantity > 0 ? item.quantity : 0;
        const sellableQuantity = Math.max(0, availableQuantity - item.reservedQuantity);
        const status = this.determineStatus(availableQuantity, item.minimumStockLevel);

        productMap.set(item.productId, {
          productId: item.productId,
          productName: item.product.name,
          brand: item.product.brand,
          category: item.product.category,
          genericName: item.product.genericName,
          pharmacyId: providerId,
          pharmacyName: item.provider.businessName,
          availableQuantity,
          reservedQuantity: item.reservedQuantity,
          sellableQuantity,
          totalBatches: 1,
          expiredBatches: 0,
          status,
          minimumStockLevel: item.minimumStockLevel,
        });
      } else {
        const existing = productMap.get(item.productId)!;
        const itemAvailable = item.inStock && item.quantity > 0 ? item.quantity : 0;
        existing.availableQuantity += itemAvailable;
        existing.reservedQuantity += item.reservedQuantity;
        existing.sellableQuantity = Math.max(
          0,
          existing.availableQuantity - existing.reservedQuantity,
        );
        existing.totalBatches += 1;
        existing.status = this.determineStatus(
          existing.availableQuantity,
          existing.minimumStockLevel,
        );
      }
    }

    let data = Array.from(productMap.values());

    // Filter by status if requested
    if (params.status) {
      data = data.filter((d) => d.status === params.status);
    }

    return {
      data,
      total,
      limit,
      offset,
    };
  }

  /**
   * Get availability for a specific medicine across all pharmacies.
   */
  async getMedicineAvailability(productId: string): Promise<MedicineAvailabilityResult> {
    const product = await this.prisma.client.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new Error(`Product not found: ${productId}`);
    }

    const inventoryItems = await this.prisma.client.inventory.findMany({
      where: {
        productId,
        deletedAt: null,
      },
      include: {
        provider: { select: { id: true, businessName: true } },
      },
    });

    // Group by pharmacy
    const pharmacyMap = new Map<
      string,
      {
        pharmacyName: string;
        availableQuantity: number;
        reservedQuantity: number;
        minimumStockLevel: number;
      }
    >();

    for (const item of inventoryItems) {
      if (!pharmacyMap.has(item.providerId)) {
        pharmacyMap.set(item.providerId, {
          pharmacyName: item.provider.businessName,
          availableQuantity: item.inStock && item.quantity > 0 ? item.quantity : 0,
          reservedQuantity: item.reservedQuantity,
          minimumStockLevel: item.minimumStockLevel ?? 10,
        });
      } else {
        const existing = pharmacyMap.get(item.providerId)!;
        const itemAvailable = item.inStock && item.quantity > 0 ? item.quantity : 0;
        existing.availableQuantity += itemAvailable;
        existing.reservedQuantity += item.reservedQuantity;
      }
    }

    const pharmacies = Array.from(pharmacyMap.entries()).map(([pharmacyId, data]) => {
      const sellableQuantity = Math.max(0, data.availableQuantity - data.reservedQuantity);
      const status = this.determineStatus(data.availableQuantity, data.minimumStockLevel);
      return {
        pharmacyId,
        pharmacyName: data.pharmacyName,
        availableQuantity: data.availableQuantity,
        reservedQuantity: data.reservedQuantity,
        sellableQuantity,
        status,
      };
    });

    const totalAvailableAcrossPharmacies = pharmacies.reduce(
      (sum, p) => sum + p.availableQuantity,
      0,
    );

    return {
      productId,
      productName: product.name,
      brand: product.brand,
      category: product.category,
      genericName: product.genericName,
      pharmacies,
      totalAvailableAcrossPharmacies,
    };
  }

  /**
   * Search available medicines across pharmacies with filters.
   */
  async searchAvailableMedicines(
    params: SearchAvailabilityParams,
  ): Promise<PaginatedAvailabilityResult> {
    const limit = params.limit ?? AVAILABILITY_CONFIG.DEFAULT_PAGE_SIZE;
    const offset = params.offset ?? 0;

    const where: Record<string, unknown> = {
      deletedAt: null,
    };

    if (params.providerId) where.providerId = params.providerId;
    if (params.productId) where.productId = params.productId;

    const productWhere: Record<string, unknown> = {};
    if (params.category) productWhere.category = params.category;
    if (params.brand) productWhere.brand = { contains: params.brand, mode: 'insensitive' };
    if (params.genericName)
      productWhere.genericName = { contains: params.genericName, mode: 'insensitive' };
    if (params.search) {
      productWhere.OR = [
        { name: { contains: params.search, mode: 'insensitive' } },
        { brand: { contains: params.search, mode: 'insensitive' } },
        { genericName: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    if (Object.keys(productWhere).length > 0) {
      where.product = productWhere;
    }

    const [inventoryItems, total] = await Promise.all([
      this.prisma.client.inventory.findMany({
        where,
        include: {
          product: true,
          provider: { select: { businessName: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.client.inventory.count({ where }),
    ]);

    const data = inventoryItems.map((item) => {
      const availableQuantity = item.inStock && item.quantity > 0 ? item.quantity : 0;
      const sellableQuantity = Math.max(0, availableQuantity - item.reservedQuantity);
      const status = this.determineStatus(availableQuantity, item.minimumStockLevel);

      return {
        productId: item.productId,
        productName: item.product.name,
        brand: item.product.brand,
        category: item.product.category,
        genericName: item.product.genericName,
        pharmacyId: item.providerId,
        pharmacyName: item.provider.businessName,
        availableQuantity,
        reservedQuantity: item.reservedQuantity,
        sellableQuantity,
        totalBatches: 1,
        expiredBatches: 0,
        status,
        minimumStockLevel: item.minimumStockLevel,
      };
    });

    return { data, total, limit, offset };
  }

  /**
   * Get reservation readiness for a product at a pharmacy.
   */
  async getReservationReadiness(
    providerId: string,
    productId: string,
  ): Promise<{
    productId: string;
    productName: string;
    pharmacyId: string;
    pharmacyName: string;
    availableQuantity: number;
    reservedQuantity: number;
    sellableQuantity: number;
    isReservable: boolean;
  }> {
    const availability = await this.getProductAvailability(providerId, productId);
    return {
      productId: availability.productId,
      productName: availability.productName,
      pharmacyId: availability.pharmacyId,
      pharmacyName: availability.pharmacyName,
      availableQuantity: availability.availableQuantity,
      reservedQuantity: availability.reservedQuantity,
      sellableQuantity: availability.sellableQuantity,
      isReservable: availability.sellableQuantity > 0,
    };
  }

  private determineStatus(
    availableQuantity: number,
    minimumStockLevel: number,
  ): AvailabilityStatus {
    if (availableQuantity <= 0) return AvailabilityStatus.OUT_OF_STOCK;
    if (availableQuantity <= minimumStockLevel * AVAILABILITY_CONFIG.STOCK.LOW_STOCK_MULTIPLIER)
      return AvailabilityStatus.LOW_STOCK;
    return AvailabilityStatus.IN_STOCK;
  }
}
