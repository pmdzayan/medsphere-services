import { InsufficientReservationStockError, planReservationFefo } from './reservation-fefo';

const candidate = (id: string, expiry: string, onHandQuantity: number, heldQuantity = 0) => ({
  id,
  inventoryId: 'inventory-1',
  expiryDate: new Date(expiry),
  manufacturingDate: null,
  onHandQuantity,
  heldQuantity,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
});

describe('reservation FEFO planning', () => {
  it('allocates earliest expiry first and ignores fully held batches', () => {
    expect(
      planReservationFefo(
        [
          candidate('later', '2027-06-01T00:00:00.000Z', 10),
          candidate('held', '2026-09-01T00:00:00.000Z', 5, 5),
          candidate('first', '2027-01-01T00:00:00.000Z', 5),
        ],
        7,
      ),
    ).toEqual([
      { batchId: 'first', inventoryId: 'inventory-1', quantity: 5 },
      { batchId: 'later', inventoryId: 'inventory-1', quantity: 2 },
    ]);
  });

  it('fails closed when eligible stock cannot satisfy the whole item', () => {
    expect(() =>
      planReservationFefo([candidate('only', '2027-01-01T00:00:00.000Z', 2)], 3),
    ).toThrow(InsufficientReservationStockError);
  });
});
