/**
 * Task 0026 CTO coverage correction.
 * Public controller response-minimization characterization.
 */
import { PublicLiveAvailabilityController } from './public-live-availability.controller';

const safeResolution = {
  requestId: '11111111-1111-4111-8111-111111111111',
  requestStatus: 'RESPONDED' as const,
  requestedAt: null,
  expiresAt: null,
  respondedAt: new Date('2026-09-10T12:00:00.000Z'),
  availabilityState: 'AVAILABLE' as const,
  confirmationSource: 'PHARMACY_CONFIRMED' as const,
  confirmedAt: new Date('2026-09-10T12:00:00.000Z'),
  retryAfterAt: null,
};

describe('PublicLiveAvailabilityController - Task 0026 CTO coverage correction', () => {
  it('returns only the minimized public contract even if an internal object carries extra fields', async () => {
    const requests = {
      createPublicRequest: jest.fn().mockResolvedValue({
        requestId: safeResolution.requestId,
        resolution: {
          ...safeResolution,
          tenantId: 'must-not-leak',
          responderUserId: 'must-not-leak',
          availableQuantity: 999,
        },
        created: false,
        reused: false,
        currentEvidence: true,
      }),
      getPublicStatus: jest.fn(),
    };
    const controller = new PublicLiveAvailabilityController(requests as never);

    const result = await controller.create('provider-a', 'product-a', {} as never);

    expect(Object.keys(result).sort()).toEqual(
      [
        'requestId',
        'requestStatus',
        'requestedAt',
        'expiresAt',
        'respondedAt',
        'availabilityState',
        'confirmationSource',
        'confirmedAt',
        'retryAfterAt',
      ].sort(),
    );
    expect(result).not.toHaveProperty('tenantId');
    expect(result).not.toHaveProperty('responderUserId');
    expect(result).not.toHaveProperty('availableQuantity');
    expect(requests.createPublicRequest).toHaveBeenCalledWith('provider-a', 'product-a');
  });

  it('delegates public status lookup using only the opaque request id', async () => {
    const requests = {
      createPublicRequest: jest.fn(),
      getPublicStatus: jest.fn().mockResolvedValue(safeResolution),
    };
    const controller = new PublicLiveAvailabilityController(requests as never);

    const result = await controller.get(safeResolution.requestId);

    expect(result).toEqual(safeResolution);
    expect(requests.getPublicStatus).toHaveBeenCalledWith(safeResolution.requestId);
  });
});
