import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LiveAvailabilityReconciliationService } from './live-availability-reconciliation.service';
import type { PublicAvailabilityResolution } from './availability-request.types';
import type { PublicNearbyMedicineSearchQueryDto } from './dto/public-nearby-medicine-search-query.dto';
import type {
  PublicNearbyMedicineSearchResponseDto,
  PublicNearbyMedicineSearchResultDto,
} from './dto/public-nearby-medicine-search-response.dto';

const EARTH_RADIUS_KM = 6371;

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

export function calculateDistanceKm(
  latitudeA: number,
  longitudeA: number,
  latitudeB: number,
  longitudeB: number,
): number {
  const dLatitude = toRadians(latitudeB - latitudeA);
  const dLongitude = toRadians(longitudeB - longitudeA);

  const a =
    Math.sin(dLatitude / 2) ** 2 +
    Math.cos(toRadians(latitudeA)) * Math.cos(toRadians(latitudeB)) * Math.sin(dLongitude / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

@Injectable()
export class PublicNearbyMedicineSearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reconciliation: LiveAvailabilityReconciliationService,
  ) {}

  async search(
    query: PublicNearbyMedicineSearchQueryDto,
  ): Promise<PublicNearbyMedicineSearchResponseDto> {
    const term = query.q.trim();

    // Coarse database-side bounding box first; exact Haversine distance below
    // remains the authoritative radius check.
    const latitudeDelta = query.radiusKm / 111.32;
    const longitudeScale = Math.max(Math.abs(Math.cos(toRadians(query.latitude))), 0.01);
    const longitudeDelta = query.radiusKm / (111.32 * longitudeScale);

    const minLatitude = Math.max(-90, query.latitude - latitudeDelta);
    const maxLatitude = Math.min(90, query.latitude + latitudeDelta);
    const minLongitude = Math.max(-180, query.longitude - longitudeDelta);
    const maxLongitude = Math.min(180, query.longitude + longitudeDelta);

    const listings = await this.prisma.client.inventory.findMany({
      where: {
        isVisible: true,
        deletedAt: null,
        provider: {
          isActive: true,
          isVerified: true,
          deletedAt: null,
          latitude: {
            gte: minLatitude,
            lte: maxLatitude,
          },
          longitude: {
            gte: minLongitude,
            lte: maxLongitude,
          },
        },
        product: {
          isActive: true,
          deletedAt: null,
          OR: [
            { name: { contains: term, mode: 'insensitive' } },
            { brand: { contains: term, mode: 'insensitive' } },
            { genericName: { contains: term, mode: 'insensitive' } },
          ],
        },
      },
      select: {
        providerId: true,
        productId: true,
        provider: {
          select: {
            tenantId: true,
            businessName: true,
            city: true,
            state: true,
            latitude: true,
            longitude: true,
          },
        },
        product: {
          select: {
            name: true,
            genericName: true,
            brand: true,
            strength: true,
            dosageForm: true,
            requiresPrescription: true,
          },
        },
      },
      distinct: ['providerId', 'productId'],
    });

    const nearbyListings = listings
      .map((listing) => ({
        listing,
        distanceKm: calculateDistanceKm(
          query.latitude,
          query.longitude,
          listing.provider.latitude,
          listing.provider.longitude,
        ),
      }))
      .filter(({ distanceKm }) => distanceKm <= query.radiusKm)
      .sort((a, b) => a.distanceKm - b.distanceKm);

    if (nearbyListings.length === 0) {
      return {
        data: [],
        limit: query.limit,
        offset: query.offset,
        radiusKm: query.radiusKm,
      };
    }

    // Task 0026: availability per (provider, product) comes from the canonical
    // trust/live reconciliation so stale or unknown evidence is never shown as
    // confidently available. Group the paged rows by provider and resolve each
    // provider's products in one scoped batch read.
    const paged = nearbyListings.slice(query.offset, query.offset + query.limit);
    const byProvider = new Map<
      string,
      Array<{ listing: (typeof listings)[number]; distanceKm: number }>
    >();
    for (const { listing, distanceKm } of paged) {
      const list = byProvider.get(listing.providerId) ?? [];
      list.push({ listing, distanceKm });
      byProvider.set(listing.providerId, list);
    }

    const resolutionByKey = new Map<string, PublicAvailabilityResolution>();
    for (const [providerKey, rows] of byProvider) {
      const tenantId = rows[0].listing.provider.tenantId;
      const products = [...new Set(rows.map(({ listing }) => listing.productId))];
      const resolutions = await this.reconciliation.resolveProviderProducts(
        tenantId,
        providerKey,
        products,
      );
      for (const row of rows) {
        const resolution = resolutions.get(row.listing.productId);
        if (resolution) {
          resolutionByKey.set(`${providerKey}:${row.listing.productId}`, resolution);
        }
      }
    }

    const data: PublicNearbyMedicineSearchResultDto[] = paged.map(({ listing, distanceKm }) => {
      const resolution = resolutionByKey.get(`${listing.providerId}:${listing.productId}`);
      return {
        productId: listing.productId,
        providerId: listing.providerId,
        providerName: listing.provider.businessName,
        providerCity: listing.provider.city,
        providerState: listing.provider.state,
        distanceKm: Math.round(distanceKm * 10) / 10,
        name: listing.product.name,
        genericName: listing.product.genericName,
        brand: listing.product.brand,
        strength: listing.product.strength,
        dosageForm: listing.product.dosageForm,
        requiresPrescription: listing.product.requiresPrescription,
        availability: resolution?.availabilityState ?? 'UNKNOWN',
        confirmationSource: resolution?.confirmationSource ?? null,
        confirmedAt: resolution?.confirmedAt ?? null,
        requestId: resolution?.requestId ?? null,
        requestStatus: resolution?.requestStatus ?? 'NONE',
        requestedAt: resolution?.requestedAt ?? null,
        expiresAt: resolution?.expiresAt ?? null,
        retryAfterAt: resolution?.retryAfterAt ?? null,
      } as PublicNearbyMedicineSearchResultDto;
    });

    return {
      data,
      limit: query.limit,
      offset: query.offset,
      radiusKm: query.radiusKm,
    };
  }
}
