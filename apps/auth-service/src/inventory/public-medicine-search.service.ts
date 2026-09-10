import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LiveAvailabilityReconciliationService } from './live-availability-reconciliation.service';
import type { PublicMedicineSearchQueryDto } from './dto/public-medicine-search-query.dto';
import type {
  PublicMedicineSearchResponseDto,
  PublicMedicineSearchResultDto,
} from './dto/public-medicine-search-response.dto';

/**
 * Read-only, unauthenticated medicine search for a single provider.
 *
 * Deliberately provider-scoped (not a cross-tenant/platform-wide search):
 * broader location/discovery across providers is explicitly out of scope
 * for this task and is future work. This mirrors the existing convention
 * that every accepted inventory route is scoped to one assigned provider.
 *
 * Task 0026: availability now comes from the canonical trust/live
 * reconciliation layer (Task 0025 batch evidence + provider/product live
 * pharmacist confirmation) instead of a raw on-hand>0 test, so stale or
 * unknown evidence is never presented as confidently available. Result
 * availability is one of AVAILABLE / UNAVAILABLE / CONFIRMATION_REQUIRED /
 * UNKNOWN plus optional minimized live-evidence fields; the exact quantity,
 * batch, inventory, staff, and audit identifiers are never exposed.
 */
@Injectable()
export class PublicMedicineSearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reconciliation: LiveAvailabilityReconciliationService,
  ) {}

  async search(
    providerId: string,
    query: PublicMedicineSearchQueryDto,
  ): Promise<PublicMedicineSearchResponseDto> {
    const provider = await this.prisma.client.provider.findFirst({
      where: { id: providerId, isActive: true, isVerified: true, deletedAt: null },
      select: { tenantId: true, businessName: true, city: true, state: true },
    });
    // Fail closed without distinguishing "does not exist" from "not
    // eligible for public search" -- both look identical to the caller,
    // preventing enumeration of inactive/unverified providers.
    if (!provider) throw new NotFoundException('Provider not found');
    const tenantId = provider.tenantId;

    const term = query.q.trim();

    const listings = await this.prisma.client.inventory.findMany({
      where: {
        providerId,
        isVisible: true,
        deletedAt: null,
        provider: { id: providerId, isActive: true, isVerified: true, deletedAt: null },
        product: {
          isActive: true,
          OR: [
            { name: { contains: term, mode: 'insensitive' } },
            { brand: { contains: term, mode: 'insensitive' } },
            { genericName: { contains: term, mode: 'insensitive' } },
          ],
        },
      },
      select: {
        productId: true,
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
      distinct: ['productId'],
      orderBy: { product: { name: 'asc' } },
      take: query.limit,
      skip: query.offset,
    });

    if (listings.length === 0) {
      return { data: [], limit: query.limit, offset: query.offset };
    }

    const productIds = listings.map((listing) => listing.productId);
    const resolutions = await this.reconciliation.resolveProviderProducts(
      tenantId,
      providerId,
      productIds,
    );

    const data: PublicMedicineSearchResultDto[] = listings.map((listing) => {
      const resolution = resolutions.get(listing.productId);
      return {
        productId: listing.productId,
        providerId,
        providerName: provider.businessName,
        providerCity: provider.city,
        providerState: provider.state,
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
      } as PublicMedicineSearchResultDto;
    });

    return { data, limit: query.limit, offset: query.offset };
  }
}
