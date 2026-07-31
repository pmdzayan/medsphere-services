import { ForbiddenException } from '@nestjs/common';
import type { Prisma } from '@medsphere/database';
import type { TrustedTenantActor } from './stock.types';

export async function assertActiveTenantActor(
  transaction: Prisma.TransactionClient,
  actor: TrustedTenantActor,
): Promise<void> {
  const membership = await transaction.tenantMembership.findFirst({
    where: {
      id: actor.membershipId,
      tenantId: actor.tenantId,
      status: 'ACTIVE',
      deletedAt: null,
      tenant: { isActive: true, deletedAt: null },
    },
    select: { id: true },
  });
  if (!membership) {
    throw new ForbiddenException('Active tenant membership required');
  }
}
