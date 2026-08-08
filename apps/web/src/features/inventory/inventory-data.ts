import type { InventoryStockItem } from '@/lib/inventory-contract';

export interface LoadedInventoryMetrics {
  products: number;
  batches: number;
  onHand: number;
  held: number;
  available: number;
}

export function loadedInventoryMetrics(items: InventoryStockItem[]): LoadedInventoryMetrics {
  return items.reduce<LoadedInventoryMetrics>(
    (metrics, item) => ({
      products: metrics.products + 1,
      batches: metrics.batches + item.batches.length,
      onHand: metrics.onHand + item.totalOnHandQuantity,
      held: metrics.held + item.totalHeldQuantity,
      available: metrics.available + item.totalAvailableQuantity,
    }),
    { products: 0, batches: 0, onHand: 0, held: 0, available: 0 },
  );
}

export function formatInventoryCurrency(value: string): string {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(amount)
    : value;
}

export function formatInventoryDate(value: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(value));
}
