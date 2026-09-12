import { BadRequestException, Injectable } from '@nestjs/common';
import type { Prisma } from '@medsphere/database';
import type { AuthenticatedIdentity } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { LiveAvailabilityReconciliationService } from './live-availability-reconciliation.service';
import type { PublicAvailabilityResolution } from './availability-request.types';
import type { PatientMedicineSearchQueryDto } from './dto/patient-medicine-search-query.dto';
import { assertPersonalAccountContext } from './patient-context';
import type {
  PatientMedicineSearchResponseDto,
  PatientMedicineSearchResultDto,
} from './dto/patient-medicine-search-response.dto';

const EARTH_RADIUS_KM = 6371;
const MAX_PRECISE_RADIUS_KM = 50;
const MAX_PRECISE_CANDIDATES = 500;

interface ProviderProductRows {
  readonly providerId: string;
  readonly productId: string;
  readonly tenantId: string;
  readonly providerBusinessName: string;
  readonly providerCity: string;
  readonly providerState: string;
  readonly distanceKm: number | null;
  readonly product: {
    readonly name: string;
    readonly genericName: string | null;
    readonly brand: string;
    readonly strength: string;
    readonly dosageForm: string;
    readonly requiresPrescription: boolean;
  };
}

type LocationMode =
  | { readonly kind: 'none' }
  | {
      readonly kind: 'area';
      readonly city: string;
      readonly state: string;
      readonly display: { readonly city: string; readonly state: string };
    }
  | {
      readonly kind: 'precise';
      readonly latitude: number;
      readonly longitude: number;
      readonly radiusKm: number;
    };

/**
 * Task 0034 - Patient medicine search.
 *
 * Authenticated, bounded, trust-aware medicine search across verified
 * providers. Search results are patient-safe presentation views: never batch,
 * allocation, held-quantity, evidence, tenant, actor, or audit data, and never
 * a stock guarantee.
 *
 * Availability comes exclusively from the accepted Task 0025/0026 canonical
 * reconciliation layer, so stale/unknown evidence is never reported as
 * confidently available.
 *
 * Location semantics:
 * - No location: a deterministic product/provider-ordered search, bounded by
 *   DB-level take/skip. No distance claim is made.
 * - Manual city/state fallback: exact-case-insensitive area filter with the
 *   same deterministic, bounded ordering. No distance claim is made.
 * - One-shot precise coordinates: the accepted nearby bounded strategy - a
 *   database-side bounding box bounds the candidate set, exact Haversine
 *   distance is computed for every candidate within the box, the accepted
 *   radius is authoritative, and only then is the page sliced. Distance
 *   ordering is therefore truthful (never a silently truncated nearest
 *   ranking).
 *
 * Bounded reads only: no unbounded findMany in the non-precise paths, and the
 * precise path reuses the accepted spatially-bounded candidate strategy. No
 * N+1 loops: availability is resolved per-provider in one scoped batch read.
 */
@Injectable()
export class PatientMedicineSearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reconciliation: LiveAvailabilityReconciliationService,
  ) {}
  async search(
    identity: AuthenticatedIdentity,
    query: PatientMedicineSearchQueryDto,
  ): Promise<PatientMedicineSearchResponseDto> {
    await assertPersonalAccountContext(this.prisma.client, identity);
    const term = this.normalizeTerm(query.q);
    const mode = this.resolveLocationMode(query);
    const paged = await this.findListings(term, mode, query);
    if (paged.length === 0) {
      return {
        data: [],
        limit: query.limit,
        offset: query.offset,
        radiusKm: mode.kind === 'precise' ? mode.radiusKm : null,
        area: mode.kind === 'area' ? mode.display : null,
      };
    }

    const resolutionByKey = await this.resolveAvailability(paged);

    const data = paged.map((row): PatientMedicineSearchResultDto => {
      const resolution = resolutionByKey.get(`${row.providerId}:${row.productId}`);
      return {
        productId: row.productId,
        providerId: row.providerId,
        providerName: row.providerBusinessName,
        providerCity: row.providerCity,
        providerState: row.providerState,
        name: row.product.name,
        genericName: row.product.genericName,
        brand: row.product.brand,
        strength: row.product.strength,
        dosageForm: row.product.dosageForm,
        requiresPrescription: row.product.requiresPrescription,
        availability: resolution?.availabilityState ?? 'UNKNOWN',
        confirmationSource: resolution?.confirmationSource ?? null,
        confirmedAt: resolution?.confirmedAt ?? null,
        requestId: resolution?.requestId ?? null,
        requestStatus: resolution?.requestStatus ?? 'NONE',
        requestedAt: resolution?.requestedAt ?? null,
        expiresAt: resolution?.expiresAt ?? null,
        retryAfterAt: resolution?.retryAfterAt ?? null,
        distanceKm: row.distanceKm,
      };
    });

    return {
      data,
      limit: query.limit,
      offset: query.offset,
      radiusKm: mode.kind === 'precise' ? mode.radiusKm : null,
      area: mode.kind === 'area' ? mode.display : null,
    };
  }
  private async findListings(
    term: string,
    mode: LocationMode,
    query: PatientMedicineSearchQueryDto,
  ): Promise<ProviderProductRows[]> {
    const where: Prisma.InventoryWhereInput = {
      isVisible: true,
      deletedAt: null,
      provider: {
        isActive: true,
        isVerified: true,
        deletedAt: null,
        ...(mode.kind === 'precise'
          ? {
              latitude: {
                gte: minimumBoundingLatitude(mode.latitude, mode.radiusKm),
                lte: maximumBoundingLatitude(mode.latitude, mode.radiusKm),
              },
              longitude: {
                gte: minimumBoundingLongitude(mode.longitude, mode.latitude, mode.radiusKm),
                lte: maximumBoundingLongitude(mode.longitude, mode.latitude, mode.radiusKm),
              },
            }
          : {}),
        ...(mode.kind === 'area'
          ? {
              city: { equals: mode.city, mode: 'insensitive' },
              ...(mode.state.length > 0
                ? { state: { equals: mode.state, mode: 'insensitive' } }
                : {}),
            }
          : {}),
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
    };

    const rows = await this.prisma.client.inventory.findMany({
      where,
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
      ...(mode.kind === 'precise'
        ? { take: MAX_PRECISE_CANDIDATES + 1 }
        : {
            orderBy: [
              { product: { name: 'asc' } },
              { provider: { businessName: 'asc' } },
              { providerId: 'asc' },
              { productId: 'asc' },
            ],
            take: query.limit,
            skip: query.offset,
          }),
    });

    if (mode.kind === 'precise' && rows.length > MAX_PRECISE_CANDIDATES) {
      throw new BadRequestException(
        'Too many nearby matches. Narrow the medicine search or search radius.',
      );
    }

    if (mode.kind !== 'precise') {
      return rows.map((row) => ({
        providerId: row.providerId,
        productId: row.productId,
        tenantId: row.provider.tenantId,
        providerBusinessName: row.provider.businessName,
        providerCity: row.provider.city,
        providerState: row.provider.state,
        distanceKm: null,
        product: row.product,
      }));
    }

    // Accepted nearby bounded strategy: distance is computed for the WHOLE
    // spatially-bounded candidate set, the accepted radius is the exact
    // filter, the result is sorted by true distance, and only then sliced.
    const withDistance = rows
      .map((row) => ({
        row,
        distanceKm: calculateDistanceKm(
          mode.latitude,
          mode.longitude,
          row.provider.latitude,
          row.provider.longitude,
        ),
      }))
      .filter(({ distanceKm }) => distanceKm <= mode.radiusKm)
      .sort(
        (left, right) =>
          left.distanceKm - right.distanceKm ||
          left.row.providerId.localeCompare(right.row.providerId) ||
          left.row.productId.localeCompare(right.row.productId),
      );

    return withDistance
      .slice(query.offset, query.offset + query.limit)
      .map(({ row, distanceKm }) => ({
        providerId: row.providerId,
        productId: row.productId,
        tenantId: row.provider.tenantId,
        providerBusinessName: row.provider.businessName,
        providerCity: row.provider.city,
        providerState: row.provider.state,
        distanceKm: Math.round(distanceKm * 10) / 10,
        product: row.product,
      }));
  }

  /** Resolves availability for the paged rows per provider (no N+1). */
  private async resolveAvailability(
    rows: readonly ProviderProductRows[],
  ): Promise<Map<string, PublicAvailabilityResolution>> {
    const byProvider = new Map<
      string,
      Array<{ providerId: string; productId: string; tenantId: string }>
    >();
    for (const row of rows) {
      const group = byProvider.get(row.providerId) ?? [];
      group.push({ providerId: row.providerId, productId: row.productId, tenantId: row.tenantId });
      byProvider.set(row.providerId, group);
    }

    const resolutions = new Map<string, PublicAvailabilityResolution>();
    for (const group of byProvider.values()) {
      const tenantId = group[0].tenantId;
      const providerId = group[0].providerId;
      const productIds = [...new Set(group.map((entry) => entry.productId))];
      const perProduct = await this.reconciliation.resolveProviderProducts(
        tenantId,
        providerId,
        productIds,
      );
      for (const entry of group) {
        const resolution = perProduct.get(entry.productId);
        if (resolution) resolutions.set(`${entry.providerId}:${entry.productId}`, resolution);
      }
    }
    return resolutions;
  }
  private normalizeTerm(value: string): string {
    const normalized = value.trim();
    if (normalized.length === 0) {
      throw new BadRequestException('Enter a medicine name to search');
    }
    return normalized;
  }

  private resolveLocationMode(query: PatientMedicineSearchQueryDto): LocationMode {
    const hasArea = query.city !== undefined || query.state !== undefined;
    const hasPrecise =
      query.latitude !== undefined || query.longitude !== undefined || query.radiusKm !== undefined;
    if (hasArea && hasPrecise) {
      throw new BadRequestException(
        'Choose one location mode: manual area or one precise location, not both',
      );
    }
    if (hasArea && (query.city === undefined || query.state === undefined)) {
      throw new BadRequestException('A manual area search requires both a city and a state');
    }
    if (hasPrecise && (query.latitude === undefined || query.longitude === undefined)) {
      throw new BadRequestException('Precise location requires both latitude and longitude');
    }
    const radiusKm = query.radiusKm ?? 10;
    if (
      hasPrecise &&
      (!Number.isInteger(radiusKm) || radiusKm < 1 || radiusKm > MAX_PRECISE_RADIUS_KM)
    ) {
      throw new BadRequestException(
        'Precise location search radius is outside the supported range',
      );
    }
    if (hasArea) {
      if (query.city!.trim().length === 0 || query.state!.trim().length === 0) {
        throw new BadRequestException('A manual area search requires both a city and a state');
      }
      return {
        kind: 'area',
        city: query.city!.trim(),
        state: query.state!.trim(),
        display: { city: query.city!.trim(), state: query.state!.trim() },
      };
    }
    if (hasPrecise) {
      return {
        kind: 'precise',
        latitude: query.latitude!,
        longitude: query.longitude!,
        radiusKm,
      };
    }
    return { kind: 'none' };
  }
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

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function minimumBoundingLatitude(latitude: number, radiusKm: number): number {
  return Math.max(-90, latitude - radiusKm / 111.32);
}

function maximumBoundingLatitude(latitude: number, radiusKm: number): number {
  return Math.min(90, latitude + radiusKm / 111.32);
}

function maximumBoundingLongitude(longitude: number, latitude: number, radiusKm: number): number {
  return Math.min(
    180,
    longitude + radiusKm / (111.32 * Math.max(Math.abs(Math.cos(toRadians(latitude))), 0.01)),
  );
}

function minimumBoundingLongitude(longitude: number, latitude: number, radiusKm: number): number {
  return Math.max(
    -180,
    longitude - radiusKm / (111.32 * Math.max(Math.abs(Math.cos(toRadians(latitude))), 0.01)),
  );
}
