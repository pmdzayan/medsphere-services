/**
 * Task 0026 CTO coverage correction.
 * Dedicated live-confirmation reconciliation tests.
 */
import { LiveAvailabilityReconciliationService } from './live-availability-reconciliation.service';

const NOW = new Date('2026-09-10T12:00:00.000Z');
const REQUEST_ID = '11111111-1111-4111-8111-111111111111';

function evidence(
  outcome: 'AVAILABLE' | 'UNAVAILABLE' | 'CHECK_LATER',
  options: { validUntil?: Date | null; retryAfterAt?: Date | null } = {},
) {
  return {
    availabilityRequestId: REQUEST_ID,
    outcome,
    confirmedAt: new Date(NOW.getTime() - 60_000),
    validUntil:
      options.validUntil === undefined ? new Date(NOW.getTime() + 30 * 60_000) : options.validUntil,
    retryAfterAt: options.retryAfterAt ?? null,
  };
}

function buildService(
  trustState: 'AVAILABLE' | 'UNAVAILABLE' | 'CONFIRMATION_REQUIRED' | 'UNKNOWN',
  liveRows: Array<ReturnType<typeof evidence>>,
) {
  const client = {
    inventory: { findFirst: jest.fn().mockResolvedValue(null) },
    providerProductAvailabilityEvidence: { findMany: jest.fn().mockResolvedValue(liveRows) },
    availabilityRequest: { findFirst: jest.fn().mockResolvedValue(null) },
  };
  const evaluator = {
    evaluateInventory: jest.fn().mockReturnValue({ state: trustState }),
  };
  const service = new LiveAvailabilityReconciliationService(
    { client } as never,
    evaluator as never,
  );
  return { service, client, evaluator };
}

describe('LiveAvailabilityReconciliationService - Task 0026 CTO coverage correction', () => {
  it('allows current pharmacist AVAILABLE to resolve uncertainty without becoming Batch quantity evidence', async () => {
    const { service } = buildService('UNKNOWN', [evidence('AVAILABLE')]);

    const result = await service.resolveProviderProduct('tenant-a', 'provider-a', 'product-a', {
      now: NOW,
      freshnessPolicy: {} as never,
    });

    expect(result.availabilityState).toBe('AVAILABLE');
    expect(result.confirmationSource).toBe('PHARMACY_CONFIRMED');
    expect(result.requestStatus).toBe('RESPONDED');
  });

  it('maps current pharmacist UNAVAILABLE to public UNAVAILABLE', async () => {
    const { service } = buildService('UNKNOWN', [evidence('UNAVAILABLE')]);

    const result = await service.resolveProviderProduct('tenant-a', 'provider-a', 'product-a', {
      now: NOW,
      freshnessPolicy: {} as never,
    });

    expect(result.availabilityState).toBe('UNAVAILABLE');
    expect(result.confirmationSource).toBe('PHARMACY_CONFIRMED');
  });

  it('maps current CHECK_LATER to confirmation required, never AVAILABLE', async () => {
    const retryAfterAt = new Date(NOW.getTime() + 10 * 60_000);
    const { service } = buildService('UNKNOWN', [
      evidence('CHECK_LATER', { validUntil: null, retryAfterAt }),
    ]);

    const result = await service.resolveProviderProduct('tenant-a', 'provider-a', 'product-a', {
      now: NOW,
      freshnessPolicy: {} as never,
    });

    expect(result.availabilityState).toBe('CONFIRMATION_REQUIRED');
    expect(result.retryAfterAt).toEqual(retryAfterAt);
  });

  it('ignores expired live evidence and falls back to canonical trust', async () => {
    const { service } = buildService('UNKNOWN', [
      evidence('AVAILABLE', { validUntil: new Date(NOW.getTime() - 1) }),
    ]);

    const result = await service.resolveProviderProduct('tenant-a', 'provider-a', 'product-a', {
      now: NOW,
      freshnessPolicy: {} as never,
    });

    expect(result.availabilityState).toBe('UNKNOWN');
    expect(result.confirmationSource).toBeNull();
  });

  it('uses current pharmacist AVAILABLE as the temporary provider/product result even when AIM batch trust is UNAVAILABLE', async () => {
    const { service } = buildService('UNAVAILABLE', [evidence('AVAILABLE')]);

    const result = await service.resolveProviderProduct('tenant-a', 'provider-a', 'product-a', {
      now: NOW,
      freshnessPolicy: {} as never,
    });

    expect(result.availabilityState).toBe('AVAILABLE');
    expect(result.confirmationSource).toBe('PHARMACY_CONFIRMED');
    expect(result.requestStatus).toBe('RESPONDED');
  });

  it('uses current CHECK_LATER as confirmation-required even when AIM batch trust is UNAVAILABLE', async () => {
    const retryAfterAt = new Date(NOW.getTime() + 10 * 60_000);
    const { service } = buildService('UNAVAILABLE', [
      evidence('CHECK_LATER', { validUntil: null, retryAfterAt }),
    ]);

    const result = await service.resolveProviderProduct('tenant-a', 'provider-a', 'product-a', {
      now: NOW,
      freshnessPolicy: {} as never,
    });

    expect(result.availabilityState).toBe('CONFIRMATION_REQUIRED');
    expect(result.confirmationSource).toBe('PHARMACY_CONFIRMED');
    expect(result.retryAfterAt).toEqual(retryAfterAt);
  });

  it('scopes live evidence and pending-request reads to tenant + provider + product', async () => {
    const { service, client } = buildService('UNKNOWN', []);

    await service.resolveProviderProduct('tenant-a', 'provider-a', 'product-a', {
      now: NOW,
      freshnessPolicy: {} as never,
    });

    expect(client.providerProductAvailabilityEvidence.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: 'tenant-a', providerId: 'provider-a', productId: 'product-a' },
        take: 1,
      }),
    );
    expect(client.availabilityRequest.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-a',
          providerId: 'provider-a',
          productId: 'product-a',
          status: 'PENDING',
        }),
      }),
    );
  });
});
