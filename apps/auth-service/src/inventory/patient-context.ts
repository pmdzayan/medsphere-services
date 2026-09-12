import { ForbiddenException } from '@nestjs/common';
import type { Prisma } from '@medsphere/database';
import { assertActiveTenantMembership, type TrustedTenantActor } from '@medsphere/security';

type PatientContextDatabase = Pick<Prisma.TransactionClient, 'tenantMembership' | 'tenant'>;

/**
 * Patient self-service is only available through the accepted personal-account
 * membership (OrganizationType.NONE). The global user id remains the resource
 * owner; this context never grants provider or pharmacy authority.
 */
export async function assertPersonalAccountContext(
  database: PatientContextDatabase,
  actor: TrustedTenantActor,
): Promise<void> {
  await assertActiveTenantMembership(database, actor);
  const personalTenant = await database.tenant.findFirst({
    where: {
      id: actor.tenantId,
      organizationType: 'NONE',
      isActive: true,
      deletedAt: null,
    },
    select: { id: true },
  });
  if (!personalTenant) {
    throw new ForbiddenException('Patient self-service requires an active personal account');
  }
}
