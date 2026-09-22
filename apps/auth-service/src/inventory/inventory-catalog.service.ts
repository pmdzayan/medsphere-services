import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthenticatedIdentity } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { assertTrustedProviderAccess } from './inventory-access';
import { InventoryCatalogQueryDto } from './dto/inventory-catalog-query.dto';
import { normalizeProductIdentifier } from './product-identifier';

const PRODUCT_SELECT = {
  id: true,
  name: true,
  genericName: true,
  brand: true,
  manufacturer: true,
  dosageForm: true,
  strength: true,
  barcode: true,
  requiresPrescription: true,
  identifiers: {
    select: { type: true, value: true, normalizedValue: true, isPrimary: true },
    orderBy: [{ isPrimary: 'desc' as const }, { createdAt: 'asc' as const }],
  },
} as const;

@Injectable()
export class InventoryCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async search(identity: AuthenticatedIdentity, providerId: string, query: InventoryCatalogQueryDto) {
    await assertTrustedProviderAccess(this.prisma.client, identity, providerId);
    const provider = await this.prisma.client.provider.findFirst({
      where: {
        id: providerId,
        tenantId: identity.tenantId,
        providerType: 'PHARMACY',
        isActive: true,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!provider) throw new NotFoundException('Assigned pharmacy provider not found');

    const identifier = query.identifier?.trim();
    const text = query.query?.trim();
    if (Boolean(identifier) === Boolean(text)) {
      throw new BadRequestException('Provide exactly one of identifier or query');
    }

    if (identifier) {
      const canonical = normalizeProductIdentifier(identifier);
      if (!canonical) throw new BadRequestException('Unsupported or invalid product identifier');

      const product = await this.prisma.client.product.findFirst({
        where: {
          isActive: true,
          deletedAt: null,
          OR: [
            { identifiers: { some: { normalizedValue: canonical.normalizedValue } } },
            { barcode: canonical.value },
          ],
        },
        select: PRODUCT_SELECT,
      });
      return { mode: 'IDENTIFIER' as const, canonicalIdentifier: canonical.normalizedValue, data: product ? [product] : [] };
    }

    if (!text || text.length < 2) throw new BadRequestException('Manual catalogue search requires at least 2 characters');
    const data = await this.prisma.client.product.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        OR: [
          { name: { contains: text, mode: 'insensitive' } },
          { genericName: { contains: text, mode: 'insensitive' } },
          { brand: { contains: text, mode: 'insensitive' } },
          { manufacturer: { contains: text, mode: 'insensitive' } },
          { strength: { contains: text, mode: 'insensitive' } },
          { barcode: { contains: text, mode: 'insensitive' } },
        ],
      },
      select: PRODUCT_SELECT,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: query.limit,
    });
    return { mode: 'MANUAL' as const, canonicalIdentifier: null, data };
  }
}
