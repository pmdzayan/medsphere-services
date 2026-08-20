import { afterEach, describe, expect, it, vi } from 'vitest';
import type { InventoryStockItem } from '@/lib/inventory-contract';
import {
  daysUntilExpiry,
  expiryUrgency,
  expiryUrgencyLabel,
  formatInventoryCurrency,
  loadedInventoryMetrics,
} from './inventory-data';

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

describe('daysUntilExpiry (calendar-day boundaries)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('is 0 when the batch expires today, regardless of current time-of-day', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-20T21:45:00.000Z'));
    expect(daysUntilExpiry('2026-08-20T03:00:00.000Z')).toBe(0);
  });

  it('is 1 when the batch expires tomorrow', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-20T23:30:00.000Z'));
    expect(daysUntilExpiry('2026-08-21T00:15:00.000Z')).toBe(1);
  });

  it('is negative for a date that has already passed', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-20T12:00:00.000Z'));
    expect(daysUntilExpiry('2026-08-18T00:00:00.000Z')).toBe(-2);
  });

  it('returns null for an unparsable date', () => {
    expect(daysUntilExpiry('not-a-date')).toBeNull();
  });
});

describe('expiryUrgency and expiryUrgencyLabel', () => {
  it('classifies a past date as overdue', () => {
    expect(expiryUrgency(-1)).toBe('overdue');
    expect(expiryUrgencyLabel(-1)).toBe('Overdue');
  });

  it('classifies exactly 7 days out as urgent, and 8 days out as upcoming', () => {
    expect(expiryUrgency(7)).toBe('urgent');
    expect(expiryUrgency(8)).toBe('upcoming');
  });

  it('labels today and tomorrow distinctly from a bare day count', () => {
    expect(expiryUrgencyLabel(0)).toBe('Expires today');
    expect(expiryUrgencyLabel(1)).toBe('Expires tomorrow');
    expect(expiryUrgencyLabel(5)).toBe('5d remaining');
  });

  it('treats an unparsable date as unknown rather than a fabricated urgency', () => {
    expect(expiryUrgency(null)).toBeNull();
    expect(expiryUrgencyLabel(null)).toBe('Expiry unknown');
  });
});
