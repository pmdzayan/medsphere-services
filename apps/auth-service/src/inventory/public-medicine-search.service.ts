import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
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
 * Exposes only fields a patient needs to decide whether to reserve --
 * never inventoryId, batchId, cost/purchase price, SKU, exact quantities,
 * staff/membership identifiers, or any other internal operational field.
 * Availability is coarse (IN_STOCK / OUT_OF_STOCK) rather than an exact
 * count, and is derived from the same eligibility criteria
 * ReservationCreationService itself uses (ACTIVE, non-expired batches,
 * visible inventory, active product) so a result shown as IN_STOCK can
 * genuinely be reserved -- no fabricated or looser criteria.
 */
@Injectable()
export class PublicMedicineSearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(
    providerId: string,
    query: PublicMedicineSearchQueryDto,
  ): Promise<PublicMedicineSearchResponseDto> {
    const provider = await this.prisma.client.provider.findFirst({
      where: { id: providerId, isActive: true, isVerified: true, deletedAt: null },
      select: { businessName: true, city: true, state: true },
    });
    // Fail closed without distinguishing "does not exist" from "not
    // eligible for public search" -- both look identical to the caller,
    // preventing enumeration of inactive/unverified providers.
    if (!provider) throw new NotFoundException('Provider not found');

    const term = query.q.trim();
    const now = new Date();

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
    const availableBatches = await this.prisma.client.batch.groupBy({
      by: ['productId'],
      where: {
        providerId,
        productId: { in: productIds },
        status: 'ACTIVE',
        expiryDate: { gt: now },
        deletedAt: null,
        inventory: { isVisible: true, deletedAt: null },
        product: { isActive: true, deletedAt: null },
      },
      _sum: { onHandQuantity: true, heldQuantity: true },
    });
    const availableByProduct = new Map<string, number>();
    for (const row of availableBatches) {
      const onHand = row._sum.onHandQuantity ?? 0;
      const held = row._sum.heldQuantity ?? 0;
      availableByProduct.set(row.productId, Math.max(0, onHand - held));
    }

    const data: PublicMedicineSearchResultDto[] = listings.map((listing) => ({
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
      availability:
        (availableByProduct.get(listing.productId) ?? 0) > 0 ? 'IN_STOCK' : 'OUT_OF_STOCK',
    }));

    return { data, limit: query.limit, offset: query.offset };
  }
}
