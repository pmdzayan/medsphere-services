import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SearchQueryDto, SearchEntityType, SearchSortBy } from './dto/search-query.dto';

export interface ProductSearchResult {
  id: string;
  name: string;
  brand: string;
  category: string;
  manufacturer: string;
  thumbnail?: string;
  price?: number;
  inStock: boolean;
  isVerified?: boolean;
  providerId?: string;
  providerName?: string;
  city?: string;
  rating?: number;
  distance?: number;
}

export interface ProviderSearchResult {
  id: string;
  businessName: string;
  providerType: string;
  city: string;
  state: string;
  isVerified: boolean;
  isActive: boolean;
  latitude: number;
  longitude: number;
  distance?: number;
  rating?: number;
}

@Injectable()
export class SearchRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Searches products (medicines, OTC, cosmetics, ayurvedic, supplements, medical devices)
   * via inventory records with provider data.
   * Future: Replace with Elasticsearch/OpenSearch query.
   */
  async searchProducts(query: SearchQueryDto): Promise<{
    results: ProductSearchResult[];
    total: number;
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    // Build dynamic WHERE clause for products
    const allowedCategories = [
      'MEDICINE',
      'OTC',
      'COSMETIC',
      'AYURVEDIC',
      'SUPPLEMENT',
      'MEDICAL_DEVICE',
    ];

    const categoryFilter: Record<string, unknown> =
      query.categories && query.categories.length > 0
        ? { in: query.categories }
        : { in: allowedCategories };

    const productWhere: Record<string, unknown> = {
      deletedAt: null,
      isActive: true,
      category: categoryFilter,
    };

    // Brand filter
    if (query.brand) {
      productWhere.brand = {
        contains: query.brand,
        mode: 'insensitive',
      };
    }

    // Text search on product name, brand, manufacturer, genericName
    if (query.query) {
      productWhere.OR = [
        { name: { contains: query.query, mode: 'insensitive' } },
        { brand: { contains: query.query, mode: 'insensitive' } },
        { manufacturer: { contains: query.query, mode: 'insensitive' } },
        { genericName: { contains: query.query, mode: 'insensitive' } },
      ];
    }

    // Build inventory WHERE
    const inventoryWhere: Record<string, unknown> = {
      deletedAt: null,
      isVisible: true,
      product: productWhere,
    };

    if (query.inStockOnly) {
      inventoryWhere.inStock = true;
    }

    if (query.verifiedOnly) {
      inventoryWhere.provider = { isVerified: true };
    }

    // Provider type filter
    if (query.providerType) {
      inventoryWhere.provider = {
        ...((inventoryWhere.provider as Record<string, unknown>) || {}),
        providerType: query.providerType,
      };
    }

    // City filter
    if (query.city) {
      inventoryWhere.provider = {
        ...((inventoryWhere.provider as Record<string, unknown>) || {}),
        city: { contains: query.city, mode: 'insensitive' },
      };
    }

    const [inventoryItems, total] = await Promise.all([
      this.prisma.client.inventory.findMany({
        where: inventoryWhere,
        include: {
          product: true,
          provider: {
            select: {
              id: true,
              businessName: true,
              city: true,
              isVerified: true,
              latitude: true,
              longitude: true,
            },
          },
        },
        orderBy: this.buildProductSortOrder(query.sortBy),
        skip,
        take: limit,
      }),
      this.prisma.client.inventory.count({
        where: inventoryWhere,
      }),
    ]);

    const results: ProductSearchResult[] = inventoryItems.map((item: Record<string, unknown>) => {
      const product = item.product as Record<string, unknown>;
      const provider = item.provider as Record<string, unknown>;
      return {
        id: product.id as string,
        name: product.name as string,
        brand: product.brand as string,
        category: product.category as string,
        manufacturer: product.manufacturer as string,
        price: Number(item.sellingPrice),
        inStock: item.inStock as boolean,
        isVerified: provider.isVerified as boolean,
        providerId: provider.id as string,
        providerName: provider.businessName as string,
        city: provider.city as string,
        distance: this.calculateDistance(
          query.latitude,
          query.longitude,
          provider.latitude as number,
          provider.longitude as number,
        ),
      };
    });

    return { results, total };
  }

  /**
   * Searches providers (pharmacies and hospitals).
   * Future: Replace with Elasticsearch/OpenSearch query.
   */
  async searchProviders(query: SearchQueryDto): Promise<{
    results: ProviderSearchResult[];
    total: number;
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {
      deletedAt: null,
      isActive: true,
    };

    // Filter by provider types requested
    if (query.types && query.types.length > 0) {
      const providerTypes = query.types
        .filter((t) => t === SearchEntityType.PHARMACY || t === SearchEntityType.HOSPITAL)
        .map((t) => (t === SearchEntityType.PHARMACY ? 'PHARMACY' : 'HOSPITAL'));
      if (providerTypes.length > 0) {
        where.providerType = { in: providerTypes };
      }
    }

    // Verified filter
    if (query.verifiedOnly) {
      where.isVerified = true;
    }

    // City filter
    if (query.city) {
      where.city = { contains: query.city, mode: 'insensitive' };
    }

    // Text search on business name
    if (query.query) {
      where.OR = [
        { businessName: { contains: query.query, mode: 'insensitive' } },
        { ownerName: { contains: query.query, mode: 'insensitive' } },
        { email: { contains: query.query, mode: 'insensitive' } },
        { city: { contains: query.query, mode: 'insensitive' } },
      ];
    }

    const [providers, total] = await Promise.all([
      this.prisma.client.provider.findMany({
        where,
        orderBy: this.buildProviderSortOrder(query.sortBy),
        skip,
        take: limit,
      }),
      this.prisma.client.provider.count({
        where,
      }),
    ]);

    const results: ProviderSearchResult[] = providers.map((provider: Record<string, unknown>) => ({
      id: provider.id as string,
      businessName: provider.businessName as string,
      providerType: provider.providerType as string,
      city: provider.city as string,
      state: provider.state as string,
      isVerified: provider.isVerified as boolean,
      isActive: provider.isActive as boolean,
      latitude: provider.latitude as number,
      longitude: provider.longitude as number,
      distance: this.calculateDistance(
        query.latitude,
        query.longitude,
        provider.latitude as number,
        provider.longitude as number,
      ),
    }));

    return { results, total };
  }

  /**
   * Builds sorting order for product/inventory queries.
   * Placeholder for future Elasticsearch relevance scoring.
   */
  private buildProductSortOrder(sortBy?: SearchSortBy): Record<string, 'asc' | 'desc'> {
    switch (sortBy) {
      case SearchSortBy.PRICE:
        return { sellingPrice: 'asc' };
      case SearchSortBy.AVAILABILITY:
        return { inStock: 'desc' };
      case SearchSortBy.RELEVANCE:
      default:
        // Future: Elasticsearch scoring will replace this
        return { createdAt: 'desc' };
    }
  }

  /**
   * Builds sorting order for provider queries.
   */
  private buildProviderSortOrder(sortBy?: SearchSortBy): Record<string, 'asc' | 'desc'> {
    switch (sortBy) {
      case SearchSortBy.RELEVANCE:
      default:
        return { createdAt: 'desc' };
    }
  }

  /**
   * Calculates approximate distance between two coordinates using the Haversine formula.
   * Returns distance in kilometers.
   * Future: Replace with PostGIS/Elasticsearch geo-distance query.
   */
  private calculateDistance(
    lat1?: number,
    lon1?: number,
    lat2?: number,
    lon2?: number,
  ): number | undefined {
    if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) {
      return undefined;
    }

    const R = 6371; // Earth's radius in km
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) *
        Math.cos(this.toRad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRad(deg: number): number {
    return (deg * Math.PI) / 180;
  }
}
