import { afterEach, describe, expect, it } from 'vitest';

import {
  clearOfflinePosDraft,
  enqueueOfflinePosDraft,
  offlinePosDraftCount,
  takeOfflinePosDraft,
} from './offline-pos-draft';

const providerA = '11111111-1111-4111-8111-111111111111';
const providerB = '22222222-2222-4222-8222-222222222222';
const providerC = '33333333-3333-4333-8333-333333333333';
const providerD = '44444444-4444-4444-8444-444444444444';
const productA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

afterEach(() => clearOfflinePosDraft());

describe('offline POS draft queue', () => {
  it('keeps only the reviewed minimal counter fields', () => {
    const draft = enqueueOfflinePosDraft(
      {
        providerId: providerA,
        lines: [{ productId: productA, quantity: 2 }],
        placeOfSupplyStateCode: '33',
        paymentMethod: 'UPI',
      },
      { now: 1000 },
    );

    expect(draft).toEqual({
      providerId: providerA,
      lines: [{ productId: productA, quantity: 2 }],
      placeOfSupplyStateCode: '33',
      paymentMethod: 'UPI',
      createdAt: 1000,
      expiresAt: 901000,
    });
    expect(Object.keys(draft ?? {}).sort()).toEqual([
      'createdAt',
      'expiresAt',
      'lines',
      'paymentMethod',
      'placeOfSupplyStateCode',
      'providerId',
    ]);
  });

  it('rejects malformed or unsafe draft shapes instead of coercing them', () => {
    expect(
      enqueueOfflinePosDraft({
        providerId: 'not-a-provider',
        lines: [{ productId: productA, quantity: 1 }],
        placeOfSupplyStateCode: '33',
        paymentMethod: 'CASH',
      }),
    ).toBeNull();

    expect(
      enqueueOfflinePosDraft({
        providerId: providerA,
        lines: [{ productId: productA, quantity: 0 }],
        placeOfSupplyStateCode: '33',
        paymentMethod: 'CASH',
      }),
    ).toBeNull();
  });

  it('expires drafts and removes them when they are taken for revalidation', () => {
    enqueueOfflinePosDraft(
      {
        providerId: providerA,
        lines: [{ productId: productA, quantity: 1 }],
        placeOfSupplyStateCode: '33',
        paymentMethod: 'CASH',
      },
      { now: 1000, ttlMs: 5000 },
    );

    expect(takeOfflinePosDraft(providerA, 3000)).not.toBeNull();
    expect(takeOfflinePosDraft(providerA, 3000)).toBeNull();

    enqueueOfflinePosDraft(
      {
        providerId: providerA,
        lines: [{ productId: productA, quantity: 1 }],
        placeOfSupplyStateCode: '33',
        paymentMethod: 'CASH',
      },
      { now: 1000, ttlMs: 5000 },
    );
    expect(takeOfflinePosDraft(providerA, 7000)).toBeNull();
  });

  it('bounds the queue to three provider drafts', () => {
    for (const providerId of [providerA, providerB, providerC, providerD]) {
      enqueueOfflinePosDraft(
        {
          providerId,
          lines: [{ productId: productA, quantity: 1 }],
          placeOfSupplyStateCode: '33',
          paymentMethod: 'CARD',
        },
        { now: 1000 },
      );
    }

    expect(offlinePosDraftCount(1000)).toBe(3);
    expect(takeOfflinePosDraft(providerA, 1000)).toBeNull();
    expect(takeOfflinePosDraft(providerD, 1000)).not.toBeNull();
  });
});
