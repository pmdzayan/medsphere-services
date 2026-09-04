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
