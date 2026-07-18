import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AvailabilityService } from '../availability/availability.service';
import {
  AVAILABILITY_CONFIG,
  AvailabilityStatus,
} from '../availability/config/availability.config';

export interface SearchResultItem {
  productId: string;
  productName: string;
  genericName: string | null;
  brand: string;
  category: string;
  subCategory: string | null;
  manufacturer: string;
  dosageForm: string;
  strength: string;
  requiresPrescription: boolean;
  availabilityStatus: AvailabilityStatus | null;
  pharmacyCount: number;
}

export interface PaginatedSearchResult {
  data: SearchResultItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface SearchQueryParams {
  query?: string;
  category?: string;
  brand?: string;
  genericName?: string;
  dosageForm?: string;
  strength?: string;
  requiresPrescription?: boolean;
  availabilityStatus?: string;
  providerId?: string;
  sortBy?: 'relevance' | 'alphabetical' | 'availability';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

@Injectable()
export class SearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly availabilityService: AvailabilityService,
  ) {}

  async search(params: SearchQueryParams): Promise<PaginatedSearchResult> {
    const limit = params.limit ?? AVAILABILITY_CONFIG.DEFAULT_PAGE_SIZE;
    const offset = params.offset ?? 0;

    const where: Record<string, unknown> = {
      deletedAt: null,
      isActive: true,
    };

    // Build search conditions
    if (params.query) {
      where.OR = [
        { name: { contains: params.query, mode: 'insensitive' } },
        { brand: { contains: params.query, mode: 'insensitive' } },
        { genericName: { contains: params.query, mode: 'insensitive' } },
        { manufacturer: { contains: params.query, mode: 'insensitive' } },
        { barcode: { contains: params.query, mode: 'insensitive' } },
      ];
    }

    if (params.category) where.category = params.category;
    if (params.brand) where.brand = { contains: params.brand, mode: 'insensitive' };
    if (params.genericName)
      where.genericName = { contains: params.genericName, mode: 'insensitive' };
    if (params.dosageForm) where.dosageForm = params.dosageForm;
    if (params.strength) where.strength = { contains: params.strength, mode: 'insensitive' };
    if (params.requiresPrescription !== undefined)
      where.requiresPrescription = params.requiresPrescription;

    // Determine sort order
    let orderBy: Record<string, unknown> | Array<Record<string, unknown>>;
    switch (params.sortBy) {
      case 'alphabetical':
        orderBy = { name: params.sortOrder ?? 'asc' };
        break;
      case 'availability':
        // Availability sorting is done post-query
        orderBy = { name: 'asc' };
        break;
      case 'relevance':
      default:
        orderBy = [{ name: 'asc' }];
        break;
    }

    const [products, total] = await Promise.all([
      this.prisma.client.product.findMany({
        where,
        orderBy,
        take: limit,
        skip: offset,
      }),
      this.prisma.client.product.count({ where }),
    ]);

    // Enrich with availability data
    const data: SearchResultItem[] = await Promise.all(
      products.map(async (product) => {
        let availabilityStatus: AvailabilityStatus | null = null;
        let pharmacyCount = 0;

        if (params.providerId) {
          // Get availability for specific pharmacy
          try {
            const availability = await this.availabilityService.getProductAvailability(
              params.providerId,
              product.id,
            );
            availabilityStatus = availability.status;
            pharmacyCount = availability.totalBatches > 0 ? 1 : 0;
          } catch {
            availabilityStatus = AvailabilityStatus.UNAVAILABLE;
          }
        } else {
          // Get availability across all pharmacies
          try {
            const medicineAvailability = await this.availabilityService.getMedicineAvailability(
              product.id,
            );
            pharmacyCount = medicineAvailability.pharmacies.length;
            // Determine overall status: IN_STOCK if any pharmacy has it
            const hasStock = medicineAvailability.pharmacies.some(
              (p) => p.status === AvailabilityStatus.IN_STOCK,
            );
            const hasLowStock = medicineAvailability.pharmacies.some(
              (p) => p.status === AvailabilityStatus.LOW_STOCK,
            );
            if (hasStock) availabilityStatus = AvailabilityStatus.IN_STOCK;
            else if (hasLowStock) availabilityStatus = AvailabilityStatus.LOW_STOCK;
            else if (pharmacyCount > 0) availabilityStatus = AvailabilityStatus.OUT_OF_STOCK;
            else availabilityStatus = AvailabilityStatus.UNAVAILABLE;
          } catch {
            availabilityStatus = AvailabilityStatus.UNAVAILABLE;
          }
        }

        return {
          productId: product.id,
          productName: product.name,
          genericName: product.genericName,
          brand: product.brand,
          category: product.category,
          subCategory: product.subCategory,
          manufacturer: product.manufacturer,
          dosageForm: product.dosageForm,
          strength: product.strength,
          requiresPrescription: product.requiresPrescription,
          availabilityStatus,
          pharmacyCount,
        };
      }),
    );

    // Post-query sort by availability if requested
    let sortedData = data;
    if (params.sortBy === 'availability') {
      const statusOrder: Record<string, number> = {
        [AvailabilityStatus.IN_STOCK]: 0,
        [AvailabilityStatus.LOW_STOCK]: 1,
        [AvailabilityStatus.OUT_OF_STOCK]: 2,
        [AvailabilityStatus.UNAVAILABLE]: 3,
      };
      sortedData = [...data].sort((a, b) => {
        const aOrder = a.availabilityStatus ? (statusOrder[a.availabilityStatus] ?? 99) : 99;
        const bOrder = b.availabilityStatus ? (statusOrder[b.availabilityStatus] ?? 99) : 99;
        const diff = aOrder - bOrder;
        if (diff !== 0) return params.sortOrder === 'desc' ? -diff : diff;
        return a.productName.localeCompare(b.productName);
      });
    }

    // Filter by availability status if requested
    if (params.availabilityStatus) {
      sortedData = sortedData.filter(
        (item) => item.availabilityStatus === params.availabilityStatus,
      );
    }

    return {
      data: sortedData,
      total,
      limit,
      offset,
    };
  }
}
