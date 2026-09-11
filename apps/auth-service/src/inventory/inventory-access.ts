import { NotFoundException } from '@nestjs/common';
import { assertTrustedProviderAccess as assertCommonTrustedProviderAccess } from '@medsphere/security';
import type { TrustedInventoryActor } from './inventory-command.types';

/**
 * Task 0020: the accepted provider-assignment boundary is now the shared
 * cross-vertical helper in `@medsphere/security`. This thin local wrapper
 * preserves the existing public not-found contract while delegating to the
 * one canonical implementation future verticals reuse.
 */
export async function assertTrustedProviderAccess(
  transaction: Parameters<typeof assertCommonTrustedProviderAccess>[0],
  actor: TrustedInventoryActor,
  providerId: string,
): Promise<void> {
  return assertCommonTrustedProviderAccess(
    transaction,
    actor,
    providerId,
    'Provider inventory not found',
  );
}

/**
 * Task 0028: shared PHARMACY provider-type assertion for the analytics read.
 *
 * Mirrors the fail-closed contract the accepted Task 0027 preference service
 * enforces (same not-found wording conceals whether the provider exists). Only
 * a live PHARMACY provider within the actor's own tenant passes; HOSPITAL
 * providers and cross-tenant lookups are indistinguishable NotFound responses.
 */
export async function assertPharmacyProviderAccess(
  database: {
    provider: {
      findFirst(args: unknown): Promise<{ id: string } | null>;
    };
  },
  tenantId: string,
  providerId: string,
): Promise<void> {
  const provider = await database.provider.findFirst({
    where: {
      id: providerId,
      tenantId,
      providerType: 'PHARMACY',
    },
    select: { id: true },
  });

  if (!provider) {
    throw new NotFoundException('Provider inventory not found');
  }
}
