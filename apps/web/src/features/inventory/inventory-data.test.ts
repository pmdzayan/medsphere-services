import { describe, expect, it } from 'vitest';
import type { InventoryStockItem } from '@/lib/inventory-contract';
import { formatInventoryCurrency, loadedInventoryMetrics } from './inventory-data';

describe('live inventory presentation', () => {
  it('derives only current-page totals from accepted stock fields', () => {
    const item = {
      totalOnHandQuantity: 20,
      totalHeldQuantity: 3,
      totalAvailableQuantity: 17,
      batches: [{}, {}],
    } as InventoryStockItem;
    expect(loadedInventoryMetrics([item])).toEqual({
      products: 1,
      batches: 2,
      onHand: 20,
      held: 3,
      available: 17,
    });
  });

  it('formats accepted decimal strings without changing their value', () => {
    expect(formatInventoryCurrency('12.50')).toContain('12.50');
  });
});
