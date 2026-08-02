import { Injectable } from '@nestjs/common';
import { AuthenticatedIdentity } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { ProviderReservationQueryDto } from './dto/reservation-query.dto';

const RESERVATION_SELECT = {
  id: true,
  status: true,
  version: true,
  expiresAt: true,
  createdAt: true,
  items: {
    select: {
      productId: true,
      quantity: true,
      product: { select: { name: true, genericName: true, brand: true } },
      allocations: {
        select: {
          batchId: true,
          quantity: true,
          status: true,
          batch: { select: { batchNumber: true } },
        },
        orderBy: { id: 'asc' as const },
      },
    },
    orderBy: { id: 'asc' as const },
  },
} as const;

@Injectable()
export class ReservationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async hasProviderAccess(identity: AuthenticatedIdentity, providerId: string): Promise<boolean> {
    const access = await this.prisma.client.membershipProviderAccess.findFirst({
      where: {
        tenantId: identity.tenantId,
        membershipId: identity.membershipId,
        providerId,
        membership: {
          userId: identity.userId,
          status: 'ACTIVE',
          deletedAt: null,
          tenant: { isActive: true, deletedAt: null },
        },
        provider: { isActive: true, deletedAt: null },
      },
      select: { id: true },
    });
    return access !== null;
  }

  async list(tenantId: string, providerId: string, query: ProviderReservationQueryDto) {
    const where = {
      tenantId,
      providerId,
      ...(query.status ? { status: query.status } : {}),
    } as const;
    const [data, total] = await Promise.all([
      this.prisma.client.medicineReservation.findMany({
        where,
        select: RESERVATION_SELECT,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: query.limit,
        skip: query.offset,
      }),
      this.prisma.client.medicineReservation.count({ where }),
    ]);
    return { data, total };
  }

  find(tenantId: string, providerId: string, reservationId: string) {
    return this.prisma.client.medicineReservation.findFirst({
      where: { id: reservationId, tenantId, providerId },
      select: RESERVATION_SELECT,
    });
  }
}
