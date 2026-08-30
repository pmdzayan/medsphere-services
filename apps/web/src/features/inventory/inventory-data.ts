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

export function formatInventoryCurrency(value: string, locale = 'en-IN'): string {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: 'INR',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(amount)
    : value;
}

export function formatInventoryDate(value: string, locale = 'en-IN'): string {
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(value));
}

export type ExpiryUrgency = 'overdue' | 'urgent' | 'upcoming';

const URGENT_WITHIN_DAYS = 7;

/**
 * Calendar-day difference between now and the given ISO date, in UTC.
 *
 * This is the single canonical expiry-day calculation for the app --
 * dashboard-workspace.tsx, inventory-workspace.tsx, and
 * expiry-worklist-workspace.tsx all import this rather than each
 * computing their own, so urgency can never disagree between screens.
 *
 * Deliberately calendar-day based (UTC year/month/day), not a raw
 * millisecond subtraction from Date.now(): a millisecond-based diff
 * would let the displayed day count shift depending on the viewer's
 * current hour or timezone even though the calendar date itself hasn't
 * changed.
 */
export function daysUntilExpiry(isoDate: string): number | null {
  const target = new Date(isoDate);
  if (Number.isNaN(target.getTime())) return null;
  const now = new Date();
  const startOfTargetUtc = Date.UTC(
    target.getUTCFullYear(),
    target.getUTCMonth(),
    target.getUTCDate(),
  );
  const startOfTodayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((startOfTargetUtc - startOfTodayUtc) / (24 * 60 * 60 * 1000));
}

export function expiryUrgency(daysUntil: number | null): ExpiryUrgency | null {
  if (daysUntil === null) return null;
  if (daysUntil < 0) return 'overdue';
  if (daysUntil <= URGENT_WITHIN_DAYS) return 'urgent';
  return 'upcoming';
}

export function expiryUrgencyLabel(daysUntil: number | null): string {
  if (daysUntil === null) return 'Expiry unknown';
  if (daysUntil < 0) return 'Overdue';
  if (daysUntil === 0) return 'Expires today';
  if (daysUntil === 1) return 'Expires tomorrow';
  return `${daysUntil}d remaining`;
}
