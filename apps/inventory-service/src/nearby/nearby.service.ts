import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AvailabilityService } from '../availability/availability.service';
import {
  AVAILABILITY_CONFIG,
  AvailabilityStatus,
} from '../availability/config/availability.config';

export interface NearbyPharmacyResult {
  pharmacyId: string;
  pharmacyName: string;
  distance: number;
  address: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
  latitude: number;
  longitude: number;
  isVerified: boolean;
  isActive: boolean;
  availableQuantity: number;
  availabilityStatus: AvailabilityStatus | null;
  productCount: number;
}

export interface PharmacyDetailResult {
  pharmacyId: string;
  pharmacyName: string;
  address: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
  latitude: number;
  longitude: number;
  isVerified: boolean;
  isActive: boolean;
  totalProducts: number;
  inStockCount: number;
  lowStockCount: number;
  outOfStockCount: number;
}

export interface PharmacyMedicineAvailabilityResult {
  pharmacyId: string;
  pharmacyName: string;
  distance: number;
  address: string;
  isVerified: boolean;
  availableQuantity: number;
  reservedQuantity: number;
  sellableQuantity: number;
  status: AvailabilityStatus;
}

export interface PaginatedNearbyResult {
  data: NearbyPharmacyResult[];
  total: number;
  limit: number;
  offset: number;
}

export interface NearbySearchParams {
  latitude: number;
  longitude: number;
  radius?: number;
  productId?: string;
  category?: string;
  isOpen24x7?: boolean;
  verifiedOnly?: boolean;
  limit?: number;
  offset?: number;
  sortBy?: 'distance' | 'availability';
}

const EARTH_RADIUS_KM = 6371;

/**
 * Haversine formula to calculate distance between two coordinates.
 * Returns distance in kilometers.
 */
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

@Injectable()
export class NearbyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly availabilityService: AvailabilityService,
  ) {}

  /**
   * Find nearby pharmacies based on user location.
   */
  async findNearbyPharmacies(params: NearbySearchParams): Promise<PaginatedNearbyResult> {
    const limit = params.limit ?? AVAILABILITY_CONFIG.DEFAULT_PAGE_SIZE;
    const offset = params.offset ?? 0;
    const radius = params.radius ?? 10; // Default 10km radius

    // Build provider query conditions
    const providerWhere: Record<string, unknown> = {
      isActive: true,
    };

    if (params.verifiedOnly) {
      providerWhere.isVerified = true;
    }

    // Get all active providers
    const providers = await this.prisma.client.provider.findMany({
      where: providerWhere,
      select: {
        id: true,
        businessName: true,
        address: true,
        city: true,
        state: true,
        country: true,
        postalCode: true,
        latitude: true,
        longitude: true,
        isVerified: true,
        isActive: true,
      },
    });

    // Calculate distances and filter by radius
    const pharmaciesWithDistance = providers
      .map((p) => ({
        ...p,
        distance: haversineDistance(params.latitude, params.longitude, p.latitude, p.longitude),
      }))
      .filter((p) => p.distance <= radius);

    // Enrich with availability data
    const enriched: NearbyPharmacyResult[] = await Promise.all(
      pharmaciesWithDistance.map(async (pharmacy) => {
        let availableQuantity = 0;
        let availabilityStatus: AvailabilityStatus | null = null;
        let productCount = 0;

        if (params.productId) {
          // Get availability for specific product at this pharmacy
          try {
            const availability = await this.availabilityService.getProductAvailability(
              pharmacy.id,
              params.productId,
            );
            availableQuantity = availability.availableQuantity;
            availabilityStatus = availability.status;
            productCount = availability.totalBatches > 0 ? 1 : 0;
          } catch {
            availabilityStatus = AvailabilityStatus.UNAVAILABLE;
          }
        } else {
          // Get overall pharmacy availability
          try {
            const pharmacyAvailability = await this.availabilityService.getPharmacyAvailability(
              pharmacy.id,
              {
                limit: 1,
                offset: 0,
              },
            );
            productCount = pharmacyAvailability.total;
            // Determine overall status
            const hasStock = pharmacyAvailability.data.some(
              (d) => d.status === AvailabilityStatus.IN_STOCK,
            );
            const hasLowStock = pharmacyAvailability.data.some(
              (d) => d.status === AvailabilityStatus.LOW_STOCK,
            );
            if (hasStock) availabilityStatus = AvailabilityStatus.IN_STOCK;
            else if (hasLowStock) availabilityStatus = AvailabilityStatus.LOW_STOCK;
            else if (productCount > 0) availabilityStatus = AvailabilityStatus.OUT_OF_STOCK;
            else availabilityStatus = AvailabilityStatus.UNAVAILABLE;
          } catch {
            availabilityStatus = AvailabilityStatus.UNAVAILABLE;
          }
        }

        return {
          pharmacyId: pharmacy.id,
          pharmacyName: pharmacy.businessName,
          distance: Math.round(pharmacy.distance * 100) / 100,
          address: pharmacy.address,
          city: pharmacy.city,
          state: pharmacy.state,
          country: pharmacy.country,
          postalCode: pharmacy.postalCode,
          latitude: pharmacy.latitude,
          longitude: pharmacy.longitude,
          isVerified: pharmacy.isVerified,
          isActive: pharmacy.isActive,
          availableQuantity,
          availabilityStatus,
          productCount,
        };
      }),
    );

    // Sort results
    let sorted = enriched;
    if (params.sortBy === 'availability') {
      const statusOrder: Record<string, number> = {
        [AvailabilityStatus.IN_STOCK]: 0,
        [AvailabilityStatus.LOW_STOCK]: 1,
        [AvailabilityStatus.OUT_OF_STOCK]: 2,
        [AvailabilityStatus.UNAVAILABLE]: 3,
      };
      sorted = [...enriched].sort((a, b) => {
        const aOrder = a.availabilityStatus ? (statusOrder[a.availabilityStatus] ?? 99) : 99;
        const bOrder = b.availabilityStatus ? (statusOrder[b.availabilityStatus] ?? 99) : 99;
        return aOrder - bOrder || a.distance - b.distance;
      });
    } else {
      // Default: sort by distance (nearest first)
      sorted = [...enriched].sort((a, b) => a.distance - b.distance);
    }

    // Apply pagination
    const paginated = sorted.slice(offset, offset + limit);

    return {
      data: paginated,
      total: sorted.length,
      limit,
      offset,
    };
  }

  /**
   * Get detailed information about a specific pharmacy.
   */
  async getPharmacyDetail(pharmacyId: string): Promise<PharmacyDetailResult> {
    const provider = await this.prisma.client.provider.findUnique({
      where: { id: pharmacyId },
    });

    if (!provider) {
      throw new Error(`Pharmacy not found: ${pharmacyId}`);
    }

    // Get pharmacy inventory summary
    const pharmacyAvailability = await this.availabilityService.getPharmacyAvailability(
      pharmacyId,
      {
        limit: 1000,
        offset: 0,
      },
    );

    const inStockCount = pharmacyAvailability.data.filter(
      (d) => d.status === AvailabilityStatus.IN_STOCK,
    ).length;
    const lowStockCount = pharmacyAvailability.data.filter(
      (d) => d.status === AvailabilityStatus.LOW_STOCK,
    ).length;
    const outOfStockCount = pharmacyAvailability.data.filter(
      (d) => d.status === AvailabilityStatus.OUT_OF_STOCK,
    ).length;

    return {
      pharmacyId: provider.id,
      pharmacyName: provider.businessName,
      address: provider.address,
      city: provider.city,
      state: provider.state,
      country: provider.country,
      postalCode: provider.postalCode,
      latitude: provider.latitude,
      longitude: provider.longitude,
      isVerified: provider.isVerified,
      isActive: provider.isActive,
      totalProducts: pharmacyAvailability.total,
      inStockCount,
      lowStockCount,
      outOfStockCount,
    };
  }

  /**
   * Get medicine availability at a specific pharmacy with distance.
   */
  async getMedicineAvailabilityByPharmacy(
    pharmacyId: string,
    productId: string,
    userLatitude?: number,
    userLongitude?: number,
  ): Promise<PharmacyMedicineAvailabilityResult> {
    const provider = await this.prisma.client.provider.findUnique({
      where: { id: pharmacyId },
    });

    if (!provider) {
      throw new Error(`Pharmacy not found: ${pharmacyId}`);
    }

    const availability = await this.availabilityService.getProductAvailability(
      pharmacyId,
      productId,
    );

    let distance = 0;
    if (userLatitude !== undefined && userLongitude !== undefined) {
      distance = haversineDistance(
        userLatitude,
        userLongitude,
        provider.latitude,
        provider.longitude,
      );
    }

    return {
      pharmacyId: provider.id,
      pharmacyName: provider.businessName,
      distance: Math.round(distance * 100) / 100,
      address: provider.address,
      isVerified: provider.isVerified,
      availableQuantity: availability.availableQuantity,
      reservedQuantity: availability.reservedQuantity,
      sellableQuantity: availability.sellableQuantity,
      status: availability.status,
    };
  }

  /**
   * Find nearby pharmacies that have a specific medicine in stock.
   */
  async findNearbyPharmaciesWithMedicine(
    params: NearbySearchParams & { productId: string },
  ): Promise<PaginatedNearbyResult> {
    return this.findNearbyPharmacies(params);
  }
}
