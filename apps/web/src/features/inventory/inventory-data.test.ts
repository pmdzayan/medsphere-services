import { describe, expect, it } from 'vitest';

import { filterInventoryItems, inventoryItems } from './inventory-data';

describe('filterInventoryItems', () => {
  it('returns every item when filters are empty', () => {
    expect(
      filterInventoryItems(inventoryItems, { query: '', status: 'all', category: 'all' }),
    ).toHaveLength(inventoryItems.length);
  });

  it('searches product, generic name, SKU, and batch without case sensitivity', () => {
    const byProduct = filterInventoryItems(inventoryItems, {
      query: 'METFORMIN',
      status: 'all',
      category: 'all',
    });
    const byBatch = filterInventoryItems(inventoryItems, {
      query: 'azm-25022',
      status: 'all',
      category: 'all',
    });

    expect(byProduct.map((item) => item.id)).toEqual(['inv-001']);
    expect(byBatch.map((item) => item.id)).toEqual(['inv-007']);
  });

  it('combines status and category filters', () => {
    const results = filterInventoryItems(inventoryItems, {
      query: '',
      status: 'low',
      category: 'Antibiotics',
    });

    expect(results.map((item) => item.id)).toEqual(['inv-002']);
  });

  it('returns an empty list when nothing matches', () => {
    expect(
      filterInventoryItems(inventoryItems, {
        query: 'not-a-real-medicine',
        status: 'all',
        category: 'all',
      }),
    ).toEqual([]);
  });
});
