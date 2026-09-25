import { describe, expect, it, vi } from 'vitest';

import type { OfflinePosDraft } from './offline-pos-draft';
import { revalidateOfflinePosDraft } from './offline-pos-revalidation';
import type { PosProductQuote } from './pos-contract';

const providerId = '11111111-1111-4111-8111-111111111111';
const productId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function quote(overrides: Partial<PosProductQuote> = {}): PosProductQuote {
  return {
    providerId,
    inventoryId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    productId,
    name: 'Paracetamol',
    genericName: 'Paracetamol',
    brand: 'AIM Test',
    strength: '500 mg',
    dosageForm: 'Tablet',
    requiresPrescription: false,
    isVisible: true,
    sellingPrice: '20.00',
    mrp: '22.00',
    discountPercentage: '0',
    gstPercentage: '5',
    fiscalProfile: {
      hsnCode: '3004',
      uqc: 'NOS',
      cessPercentage: '0',
      version: 1,
    },
    availableQuantity: 10,
    ...overrides,
  };
}

function draft(quantity = 2): OfflinePosDraft {
  return {
    providerId,
    lines: [{ productId, quantity }],
    placeOfSupplyStateCode: '33',
    paymentMethod: 'CASH',
    createdAt: 1000,
    expiresAt: 901000,
  };
}

describe('offline POS revalidation', () => {
  it('refreshes every line and never performs checkout itself', async () => {
    const loadQuote = vi.fn().mockResolvedValue(quote());
    const result = await revalidateOfflinePosDraft(draft(), loadQuote);

    expect(loadQuote).toHaveBeenCalledWith(providerId, productId);
    expect(result.lines).toEqual([{ quote: quote(), quantity: 2 }]);
    expect(result.hasConflict).toBe(false);
  });

  it('caps stale quantities and requires operator review', async () => {
    const result = await revalidateOfflinePosDraft(
      draft(8),
      vi.fn().mockResolvedValue(quote({ availableQuantity: 3 })),
    );

    expect(result.lines[0]?.quantity).toBe(3);
    expect(result.hasConflict).toBe(true);
  });

  it('fails closed when a medicine becomes prescription-required', async () => {
    await expect(
      revalidateOfflinePosDraft(
        draft(),
        vi.fn().mockResolvedValue(quote({ requiresPrescription: true })),
      ),
    ).rejects.toThrow('no longer eligible');
  });

  it('requires review when fiscal configuration is no longer complete', async () => {
    const result = await revalidateOfflinePosDraft(
      draft(),
      vi.fn().mockResolvedValue(quote({ fiscalProfile: null })),
    );

    expect(result.hasConflict).toBe(true);
  });
});
