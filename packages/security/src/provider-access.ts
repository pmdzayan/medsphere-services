import type { Prisma } from '@medsphere/database';
import { NotFoundException } from '@nestjs/common';
import type { TrustedTenantActor } from './trusted-actor';
import { assertActiveTenantMembership } from './tenant-scope';

/**
 * Task 0020 — Common active-tenant-actor + provider-scope assertion.
 *
 * Combines the trusted-identity membership checks with the accepted
 * provider-assignment boundary (ADR-007). A membership is NOT automatically
 * allowed to every provider in the tenant: provider authority comes from
 * `MembershipProviderAccess` (live server state).
 *
 * The identical NotFound response conceals whether the provider exists in the
 * tenant, preventing cross-provider enumeration.
 */

export interface ActiveProviderScope {
  readonly providerId: string;
}

/**
 * Verify `providerId` is assigned to the actor's membership in the trusted
 * tenant. Does NOT require the caller to re-derive the assigned provider id.
 *
 * `notFoundMessage` preserves an existing public error contract for callers
 * that already expose a specific not-found wording; the default conceals
 * cross-tenant provider existence the same way.
 */
export async function assertTrustedProviderAccess(
  database: Pick<Prisma.TransactionClient, 'membershipProviderAccess'>,
  actor: TrustedTenantActor,
  providerId: string,
  notFoundMessage = 'Provider not found',
): Promise<void> {
  const access = await database.membershipProviderAccess.findFirst({
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
    throw new NotFoundException(notFoundMessage);
  }
}

/**
 * One-call boundary for a tenant human acting on an assigned provider.
 * Fail-closed on membership/user/tenant/provider all at once.
 */
export async function requireActiveTenantActorWithProvider(
  transaction: Pick<Prisma.TransactionClient, 'tenantMembership' | 'membershipProviderAccess'>,
  actor: TrustedTenantActor,
  providerId: string,
): Promise<void> {
  await assertActiveTenantMembership(transaction, actor);
  await assertTrustedProviderAccess(transaction, actor, providerId);
}
