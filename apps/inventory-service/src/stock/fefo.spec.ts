import { InsufficientFefoStockError, planFefoAllocation } from './fefo';
import type { FefoCandidate } from './stock.types';

const asOf = new Date('2026-07-31T00:00:00.000Z');

function candidate(overrides: Partial<FefoCandidate> & Pick<FefoCandidate, 'id'>): FefoCandidate {
  return {
    id: overrides.id,
    inventoryId: overrides.inventoryId ?? 'inventory-1',
    expiryDate: overrides.expiryDate ?? new Date('2027-01-01T00:00:00.000Z'),
    manufacturingDate:
      overrides.manufacturingDate === undefined
        ? new Date('2025-01-01T00:00:00.000Z')
        : overrides.manufacturingDate,
    onHandQuantity: overrides.onHandQuantity ?? 10,
    heldQuantity: overrides.heldQuantity ?? 0,
    status: overrides.status ?? 'ACTIVE',
    createdAt: overrides.createdAt ?? new Date('2026-01-01T00:00:00.000Z'),
    deletedAt: overrides.deletedAt ?? null,
  };
}

describe('planFefoAllocation', () => {
  it('uses expiry, manufacturing date, creation time, and id as stable tie-breakers', () => {
    const allocations = planFefoAllocation(
      [
        candidate({ id: 'd', manufacturingDate: null }),
        candidate({ id: 'c', createdAt: new Date('2026-02-01T00:00:00.000Z') }),
        candidate({ id: 'b' }),
        candidate({ id: 'a' }),
        candidate({ id: 'earliest', expiryDate: new Date('2026-08-01T00:00:00.000Z') }),
      ],
      41,
      asOf,
    );

    expect(allocations).toEqual([
      { batchId: 'earliest', inventoryId: 'inventory-1', quantity: 10 },
      { batchId: 'a', inventoryId: 'inventory-1', quantity: 10 },
      { batchId: 'b', inventoryId: 'inventory-1', quantity: 10 },
      { batchId: 'c', inventoryId: 'inventory-1', quantity: 10 },
      { batchId: 'd', inventoryId: 'inventory-1', quantity: 1 },
    ]);
  });

  it('derives availability and excludes expired, exhausted, deleted, and fully held batches', () => {
    const allocations = planFefoAllocation(
      [
        candidate({ id: 'eligible', onHandQuantity: 10, heldQuantity: 3 }),
        candidate({ id: 'expired-date', expiryDate: asOf }),
        candidate({ id: 'expired-status', status: 'EXPIRED' }),
        candidate({ id: 'exhausted', status: 'EXHAUSTED' }),
        candidate({ id: 'deleted', deletedAt: new Date('2026-01-01T00:00:00.000Z') }),
        candidate({ id: 'held', heldQuantity: 10 }),
      ],
      7,
      asOf,
    );

    expect(allocations).toEqual([{ batchId: 'eligible', inventoryId: 'inventory-1', quantity: 7 }]);
  });

  it('reports the exact eligible total without partial allocation', () => {
    expect(() =>
      planFefoAllocation(
        [
          candidate({ id: 'one', onHandQuantity: 4 }),
          candidate({ id: 'two', onHandQuantity: 5, heldQuantity: 2 }),
        ],
        8,
        asOf,
      ),
    ).toThrow(
      expect.objectContaining<Partial<InsufficientFefoStockError>>({
        requestedQuantity: 8,
        availableQuantity: 7,
      }),
    );
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid requested quantity %s',
    (quantity) => {
      expect(() => planFefoAllocation([], quantity, asOf)).toThrow('positive safe integer');
    },
  );
});
