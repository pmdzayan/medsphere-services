import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface NearbyProviderResult {
  id: string;
  businessName: string;
  providerType: string;
  address: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
  latitude: number;
  longitude: number;
  isVerified: boolean;
  isActive: boolean;
  phone: string;
  email: string;
  distance: number;
}

@Injectable()
export class LocationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findNearbyProviders(params: {
    latitude: number;
    longitude: number;
    radiusKm: number;
    providerType?: string;
    verifiedOnly?: boolean;
  }): Promise<NearbyProviderResult[]> {
    // Fetch all active, non-deleted providers
    const whereClause: Record<string, unknown> = {
      deletedAt: null,
      isActive: true,
    };

    if (params.providerType) {
      whereClause.providerType = params.providerType;
    }

    if (params.verifiedOnly) {
      whereClause.isVerified = true;
    }

    const providers = await this.prisma.client.provider.findMany({
      where: whereClause,
      select: {
        id: true,
        businessName: true,
        providerType: true,
        address: true,
        city: true,
        state: true,
        country: true,
        postalCode: true,
        latitude: true,
        longitude: true,
        isVerified: true,
        isActive: true,
        phone: true,
        email: true,
      },
    });

    // Haversine formula calculation (database-agnostic)
    const results: NearbyProviderResult[] = [];

    for (const provider of providers) {
      const distance = this.calculateDistance(
        params.latitude,
        params.longitude,
        provider.latitude,
        provider.longitude,
      );

      // Filter by radius
      if (distance <= params.radiusKm) {
        results.push({
          id: provider.id,
          businessName: provider.businessName,
          providerType: provider.providerType,
          address: provider.address,
          city: provider.city,
          state: provider.state,
          country: provider.country,
          postalCode: provider.postalCode,
          latitude: provider.latitude,
          longitude: provider.longitude,
          isVerified: provider.isVerified,
          isActive: provider.isActive,
          phone: provider.phone,
          email: provider.email,
          distance: Math.round(distance * 100) / 100, // Round to 2 decimal places
        });
      }
    }

    // Sort by distance (closest first)
    results.sort((a, b) => a.distance - b.distance);

    return results;
  }

  async findProviderLocation(id: string) {
    return this.prisma.client.provider.findUnique({
      where: { id },
      select: {
        id: true,
        businessName: true,
        providerType: true,
        address: true,
        city: true,
        state: true,
        country: true,
        postalCode: true,
        latitude: true,
        longitude: true,
        isVerified: true,
        isActive: true,
        phone: true,
        email: true,
      },
    });
  }

  /**
   * Haversine formula to calculate distance between two coordinates in kilometers.
   * This is database-agnostic - can be replaced with PostGIS ST_Distance when needed.
   */
  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
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

  private toRad(degrees: number): number {
    return (degrees * Math.PI) / 180;
  }
}
