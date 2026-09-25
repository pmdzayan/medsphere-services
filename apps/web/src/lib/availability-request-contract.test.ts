import { describe, expect, it } from 'vitest';
import {
  isAvailabilityRequestQueuePage,
  isAvailabilityResponseReceipt,
  isAvailabilityResponseRequest,
} from './availability-request-contract';

const uuid = (suffix: string) => `10000000-0000-4000-8000-${suffix.padStart(12, '0')}`;

function queueRow() {
  return {
    requestId: uuid('1'),
    productId: uuid('2'),
    productName: 'Paracetamol',
    genericName: 'Paracetamol',
    brand: 'AIM Test',
    strength: '500 mg',
    dosageForm: 'TABLET',
    status: 'PENDING',
    requestedAt: '2026-09-24T12:00:00.000Z',
    expiresAt: '2026-09-24T12:10:00.000Z',
    version: 1,
  } as const;
}

describe('Task 0046 availability request web contract', () => {
  it('accepts only the minimized patient-free queue payload', () => {
    const page = { data: [queueRow()], total: 1, limit: 25, offset: 0 };
    expect(isAvailabilityRequestQueuePage(page)).toBe(true);
    expect(
      isAvailabilityRequestQueuePage({
        ...page,
        data: [{ ...queueRow(), subjectUserId: uuid('9') }],
      }),
    ).toBe(false);
    expect(isAvailabilityRequestQueuePage({ ...page, limit: 51 })).toBe(false);
  });

  it('requires bounded exact pharmacist response input', () => {
    expect(
      isAvailabilityResponseRequest({
        outcome: 'AVAILABLE',
        idempotencyKey: 'availability-response-1',
        expectedVersion: 1,
      }),
    ).toBe(true);
    expect(
      isAvailabilityResponseRequest({
        outcome: 'CHECK_LATER',
        idempotencyKey: 'availability-response-2',
        expectedVersion: 1,
        retryAfterMinutes: 15,
      }),
    ).toBe(true);
    expect(
      isAvailabilityResponseRequest({
        outcome: 'AVAILABLE',
        idempotencyKey: 'availability-response-3',
        expectedVersion: 1,
        retryAfterMinutes: 15,
      }),
    ).toBe(false);
    expect(
      isAvailabilityResponseRequest({
        outcome: 'AVAILABLE',
        idempotencyKey: ' key ',
        expectedVersion: 1,
      }),
    ).toBe(false);
  });

  it('strictly validates pharmacist response receipts', () => {
    const receipt = {
      requestId: uuid('1'),
      outcome: 'AVAILABLE',
      confirmedAt: '2026-09-24T12:01:00.000Z',
      validUntil: '2026-09-24T12:06:00.000Z',
      retryAfterAt: null,
      replayed: false,
    } as const;
    expect(isAvailabilityResponseReceipt(receipt)).toBe(true);
    expect(isAvailabilityResponseReceipt({ ...receipt, actorUserId: uuid('9') })).toBe(false);
  });
});
