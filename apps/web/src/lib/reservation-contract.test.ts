import { describe, expect, it } from 'vitest';
import { validReservationPage } from '@/test/reservation-fixtures';
import { isProviderReservationPage } from './reservation-contract';

describe('reservation boundary contract', () => {
  it('accepts an exact internally consistent reservation page', () => {
    expect(isProviderReservationPage(validReservationPage)).toBe(true);
  });

  it('rejects patient or persistence fields crossing the boundary', () => {
    const reservation = validReservationPage.data[0];
    expect(
      isProviderReservationPage({
        ...validReservationPage,
        data: [{ ...reservation, patientName: 'Must not cross' }],
      }),
    ).toBe(false);
  });

  it('rejects inconsistent item, allocation, total, and pagination quantities', () => {
    const reservation = validReservationPage.data[0];
    const item = reservation.items[0];
    expect(
      isProviderReservationPage({
        ...validReservationPage,
        data: [{ ...reservation, totalQuantity: 3 }],
      }),
    ).toBe(false);
    expect(
      isProviderReservationPage({
        ...validReservationPage,
        data: [
          {
            ...reservation,
            items: [
              {
                ...item,
                allocations: [{ ...item.allocations[0], quantity: 1 }],
              },
            ],
          },
        ],
      }),
    ).toBe(false);
    expect(isProviderReservationPage({ ...validReservationPage, total: 0 })).toBe(false);
  });
});
