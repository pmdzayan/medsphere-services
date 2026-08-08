import { describe, expect, it } from 'vitest';
import { validProviders, validStockPage } from '@/test/inventory-fixtures';
import { isInventoryStockPage, isProviderAccessList } from './inventory-contract';

describe('inventory boundary contracts', () => {
  it('accepts exact assigned-provider and stock responses', () => {
    expect(isProviderAccessList(validProviders)).toBe(true);
    expect(isInventoryStockPage(validStockPage)).toBe(true);
  });

  it('rejects over-broad and malformed provider responses', () => {
    expect(isProviderAccessList([{ ...validProviders[0], tenantId: 'untrusted' }])).toBe(false);
    expect(isProviderAccessList([{ ...validProviders[0], providerId: 'not-a-uuid' }])).toBe(false);
  });

  it('rejects inconsistent quantities, aggregates, pagination, and extra fields', () => {
    const item = validStockPage.data[0];
    expect(
      isInventoryStockPage({ ...validStockPage, data: [{ ...item, totalAvailableQuantity: 18 }] }),
    ).toBe(false);
    expect(
      isInventoryStockPage({
        ...validStockPage,
        data: [{ ...item, batches: [{ ...item.batches[0], availableQuantity: 18 }] }],
      }),
    ).toBe(false);
    expect(isInventoryStockPage({ ...validStockPage, total: 0 })).toBe(false);
    expect(isInventoryStockPage({ ...validStockPage, internal: 'leak' })).toBe(false);
  });

  it('accepts unavailable units excluded by expiry eligibility', () => {
    const item = validStockPage.data[0];
    expect(
      isInventoryStockPage({
        ...validStockPage,
        data: [
          {
            ...item,
            totalAvailableQuantity: 0,
            batches: [
              {
                ...item.batches[0],
                status: 'EXPIRED',
                availableQuantity: 0,
              },
            ],
          },
        ],
      }),
    ).toBe(true);
  });
});
