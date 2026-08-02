import { NotFoundException } from '@nestjs/common';
import type { Prisma } from '@medsphere/database';
import type { TrustedInventoryActor } from './inventory-command.types';

/**
 * Resolves provider authority from the live membership-to-provider assignment.
 * The identical not-found response conceals whether a provider exists elsewhere
 * in the tenant or platform.
 */
export async function assertTrustedProviderAccess(
  transaction: Pick<Prisma.TransactionClient, 'membershipProviderAccess'>,
  actor: TrustedInventoryActor,
  providerId: string,
): Promise<void> {
  const access = await transaction.membershipProviderAccess.findFirst({
    where: {
      tenantId: actor.tenantId,
      membershipId: actor.membershipId,
      providerId,
      membership: {
        userId: actor.userId,
        status: 'ACTIVE',
        deletedAt: null,
        tenant: { isActive: true, deletedAt: null },
      },
      provider: { isActive: true, deletedAt: null },
    },
    select: { id: true },
  });

  if (!access) {
    throw new NotFoundException('Provider inventory not found');
  }
}
