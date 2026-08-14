import { describe, expect, it } from 'vitest';
import { validReservationPage } from '@/test/reservation-fixtures';
import {
  isProviderReservationPage,
  isReservationCreationRequest,
  isReservationCreationResponse,
  isReservationTransitionRequest,
  isReservationTransitionResponse,
} from './reservation-contract';

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

  it('accepts only exact lifecycle commands and receipts', () => {
    const request = { transition: 'READY', expectedVersion: 2, idempotencyKey: 'ready-1' };
    const receipt = {
      reservationId: validReservationPage.data[0].id,
      status: 'READY',
      version: 3,
      totalQuantity: 2,
      replayed: false,
    };
    expect(isReservationTransitionRequest(request)).toBe(true);
    expect(isReservationTransitionRequest({ ...request, transition: 'EXPIRE' })).toBe(false);
    expect(isReservationTransitionRequest({ ...request, tenantId: 'leak' })).toBe(false);
    expect(isReservationTransitionResponse(receipt)).toBe(true);
    expect(isReservationTransitionResponse({ ...receipt, subjectUserId: 'leak' })).toBe(false);
  });

  it('accepts only exact correlated creation commands and receipts', () => {
    const request = {
      subjectUserId: 'f63f50dd-49b0-4a77-bc04-f7d00db58dd5',
      expiresAt: '2027-08-01T12:00:00.000Z',
      items: [{ productId: '8b4d574f-48c6-4231-8851-e65edc9f9d42', quantity: 2 }],
      idempotencyKey: 'reservation-create-1',
    };
    const receipt = {
      reservationId: '73a97ec4-84f8-4a85-a493-b8d6feb84a27',
      status: 'PENDING',
      version: 1,
      itemCount: 1,
      totalQuantity: 2,
      replayed: false,
    };
    expect(isReservationCreationRequest(request)).toBe(true);
    expect(isReservationCreationRequest({ ...request, tenantId: 'leak' })).toBe(false);
    expect(
      isReservationCreationRequest({ ...request, items: [request.items[0], request.items[0]] }),
    ).toBe(false);
    expect(isReservationCreationResponse(receipt, request)).toBe(true);
    expect(isReservationCreationResponse({ ...receipt, totalQuantity: 3 }, request)).toBe(false);
    expect(
      isReservationCreationResponse({ ...receipt, subjectUserId: request.subjectUserId }, request),
    ).toBe(false);
  });
});
