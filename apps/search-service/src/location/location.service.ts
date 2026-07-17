import { Injectable, NotFoundException } from '@nestjs/common';
import { LocationRepository } from './location.repository';
import { NearbyQueryDto } from './dto/nearby-query.dto';
import { NearbyResponseDto, NearbyProviderDto } from './dto/nearby-response.dto';

@Injectable()
export class LocationService {
  constructor(private readonly repository: LocationRepository) {}

  async findNearby(query: NearbyQueryDto): Promise<NearbyResponseDto> {
    const radiusKm = query.radius ?? 5;

    const nearbyProviders = await this.repository.findNearbyProviders({
      latitude: query.latitude,
      longitude: query.longitude,
      radiusKm,
      providerType: query.providerType,
      verifiedOnly: query.verifiedOnly,
    });

    const providers: NearbyProviderDto[] = nearbyProviders.map((p) => ({
      id: p.id,
      businessName: p.businessName,
      providerType: p.providerType,
      address: p.address,
      city: p.city,
      state: p.state,
      country: p.country,
      postalCode: p.postalCode,
      latitude: p.latitude,
      longitude: p.longitude,
      distance: p.distance,
      estimatedTravelDistance: this.estimateTravelDistance(p.distance),
      isVerified: p.isVerified,
      isActive: p.isActive,
      phone: p.phone,
      email: p.email,
    }));

    return {
      providers,
      total: providers.length,
      queryLatitude: query.latitude,
      queryLongitude: query.longitude,
      radiusKm,
      sortBy: 'distance',
    };
  }

  async findProviderLocation(id: string): Promise<NearbyProviderDto> {
    const provider = await this.repository.findProviderLocation(id);

    if (!provider) {
      throw new NotFoundException('Provider not found');
    }

    return {
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
      distance: 0,
      estimatedTravelDistance: this.estimateTravelDistance(0),
      isVerified: provider.isVerified,
      isActive: provider.isActive,
      phone: provider.phone,
      email: provider.email,
    };
  }

  /**
   * Placeholder for estimated travel distance.
   * Future: Integrate with Google Maps Distance Matrix API or OSRM.
   */
  private estimateTravelDistance(distanceKm: number): string {
    // Rough estimate: ~1.4x straight-line distance for road travel
    const roadDistance = Math.round(distanceKm * 1.4 * 10) / 10;
    return `${roadDistance} km (estimated)`;
  }
}
