import { describe, expect, it } from 'vitest';
import {
  isPatientLiveAvailabilityRequestResponse,
  isPatientMedicineSearchResponse,
} from './patient-medicine-search-contract';
import {
  isCancelPatientReservationRequest,
  isCreatePatientReservationRequest,
  isCreatePatientReservationResponse,
  isPatientReservation,
  isPatientReservationPage,
} from './patient-reservation-contract';

const uuid = (suffix: string) => `10000000-0000-4000-8000-${suffix.padStart(12, '0')}`;

function searchItem() {
  return {
    productId: uuid('1'),
    providerId: uuid('2'),
    providerName: 'Central Pharmacy',
    providerCity: 'Vaniyambadi',
    providerState: 'Tamil Nadu',
    name: 'Paracetamol',
    genericName: 'Paracetamol',
    brand: 'AIM Test',
    strength: '500 mg',
    dosageForm: 'TABLET',
    requiresPrescription: false,
    availability: 'CONFIRMATION_REQUIRED',
    confirmationSource: null,
    confirmedAt: null,
    requestId: null,
    requestStatus: 'NONE',
    requestedAt: null,
    expiresAt: null,
    retryAfterAt: null,
    distanceKm: null,
  };
}

function reservation() {
  return {
    id: uuid('3'),
    status: 'PENDING',
    version: 1,
    expiresAt: '2026-09-13T12:00:00.000Z',
    createdAt: '2026-09-12T12:00:00.000Z',
    cancelledAt: null,
    expiredAt: null,
    providerId: uuid('2'),
    providerName: 'Central Pharmacy',
    providerCity: 'Vaniyambadi',
    providerState: 'Tamil Nadu',
    items: [
      {
        productId: uuid('1'),
        name: 'Paracetamol',
        genericName: 'Paracetamol',
        brand: 'AIM Test',
        strength: '500 mg',
        dosageForm: 'TABLET',
        quantity: 2,
      },
    ],
    totalQuantity: 2,
  };
}

describe('Task 0034 patient web contracts', () => {
  it('strictly validates trust-aware medicine search success payloads', () => {
    const response = {
      data: [searchItem()],
      limit: 20,
      offset: 0,
      radiusKm: null,
      area: { city: 'Vaniyambadi', state: 'Tamil Nadu' },
    };
    expect(isPatientMedicineSearchResponse(response)).toBe(true);
    expect(isPatientMedicineSearchResponse({ ...response, tenantId: uuid('9') })).toBe(false);
    expect(
      isPatientMedicineSearchResponse({
        ...response,
        data: [{ ...searchItem(), availability: 'IN_STOCK' }],
      }),
    ).toBe(false);
    expect(
      isPatientMedicineSearchResponse({
        ...response,
        data: Array.from({ length: 21 }, () => searchItem()),
      }),
    ).toBe(false);
  });

  it('strictly validates minimized live availability responses', () => {
    const response = {
      requestId: uuid('4'),
      requestStatus: 'PENDING',
      requestedAt: '2026-09-12T12:00:00.000Z',
      expiresAt: '2026-09-12T12:10:00.000Z',
      respondedAt: null,
      availabilityState: 'CONFIRMATION_REQUIRED',
      confirmationSource: null,
      confirmedAt: null,
      retryAfterAt: null,
    };
    expect(isPatientLiveAvailabilityRequestResponse(response)).toBe(true);
    expect(isPatientLiveAvailabilityRequestResponse({ ...response, staffUserId: uuid('9') })).toBe(
      false,
    );
  });

  it('accepts optional expiry and rejects reservation ownership injection and excessive quantity', () => {
    const valid = {
      providerId: uuid('2'),
      items: [{ productId: uuid('1'), quantity: 2 }],
      idempotencyKey: 'reserve-1',
    };
    expect(isCreatePatientReservationRequest(valid)).toBe(true);
    expect(isCreatePatientReservationRequest({ ...valid, subjectUserId: uuid('9') })).toBe(false);
    expect(isCreatePatientReservationRequest({ ...valid, tenantId: uuid('9') })).toBe(false);
    expect(
      isCreatePatientReservationRequest({
        ...valid,
        items: [{ productId: uuid('1'), quantity: 101 }],
      }),
    ).toBe(false);
    expect(
      isCreatePatientReservationRequest({
        ...valid,
        items: [
          { productId: uuid('1'), quantity: 60 },
          { productId: uuid('5'), quantity: 60 },
        ],
      }),
    ).toBe(false);
  });

  it.each(['', '   ', ' key', 'key '])(
    'rejects non-canonical reservation idempotency key %p',
    (idempotencyKey) => {
      expect(
        isCreatePatientReservationRequest({
          providerId: uuid('2'),
          items: [{ productId: uuid('1'), quantity: 1 }],
          idempotencyKey,
        }),
      ).toBe(false);
      expect(isCancelPatientReservationRequest({ expectedVersion: 1, idempotencyKey })).toBe(false);
    },
  );

  it('rejects unexpected or internally inconsistent reservation success payloads', () => {
    const row = reservation();
    expect(isPatientReservation(row)).toBe(true);
    expect(isPatientReservation({ ...row, subjectUserId: uuid('9') })).toBe(false);
    expect(isPatientReservation({ ...row, totalQuantity: 1 })).toBe(false);
    expect(isPatientReservationPage({ data: [row], total: 1, limit: 20, offset: 0 })).toBe(true);
    expect(isPatientReservationPage({ data: [row], total: 0, limit: 20, offset: 0 })).toBe(false);

    const creation = {
      reservationId: uuid('3'),
      status: 'PENDING',
      version: 1,
      itemCount: 1,
      totalQuantity: 2,
      expiresAt: '2026-09-13T12:00:00.000Z',
      replayed: false,
    };
    expect(isCreatePatientReservationResponse(creation)).toBe(true);
    expect(isCreatePatientReservationResponse({ ...creation, allocationIds: [uuid('8')] })).toBe(
      false,
    );
  });
});
