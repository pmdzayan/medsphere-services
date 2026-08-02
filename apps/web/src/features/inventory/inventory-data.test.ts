import { describe, expect, it } from 'vitest';

import {
  createPreviewInventoryDataset,
  filterInventoryItems,
  previewInventoryDataset,
  summarizeInventory,
} from './inventory-data';

const inventoryItems = previewInventoryDataset.items;

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

  it('derives every summary metric from the supplied batch rows', () => {
    expect(summarizeInventory(inventoryItems)).toEqual({
      inventoryValue: 11940.14,
      productCount: 8,
      availableUnits: 926,
      lowCount: 2,
      expiringCount: 2,
      outCount: 1,
    });
  });

  it('rejects preview data that violates batch quantity authority', () => {
    const invalid = {
      ...inventoryItems[0],
      available: inventoryItems[0].onHand,
    };

    expect(() =>
      createPreviewInventoryDataset({
        label: 'Preview',
        disclosure: 'Not operational data.',
        items: [invalid],
      }),
    ).toThrow('Invalid inventory preview dataset.');
  });

  it('rejects duplicate row and batch identities', () => {
    expect(() =>
      createPreviewInventoryDataset({
        label: 'Preview',
        disclosure: 'Not operational data.',
        items: [inventoryItems[0], inventoryItems[0]],
      }),
    ).toThrow('Invalid inventory preview dataset.');
  });
});
