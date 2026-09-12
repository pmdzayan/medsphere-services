import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '@/components/language-provider';
import {
  cancelPatientReservation,
  createPatientReservation,
  getPatientLiveAvailabilityStatus,
  listPatientReservations,
  recordConsent,
  requestPatientLiveAvailability,
  searchPatientMedicine,
} from '@/lib/api-client';
import { requestCurrentLocation } from '@/lib/browser-permissions';
import { PatientMedicinesWorkspace } from './patient-medicines';

vi.mock('@/lib/api-client', () => ({
  cancelPatientReservation: vi.fn(),
  createPatientReservation: vi.fn(),
  getPatientLiveAvailabilityStatus: vi.fn(),
  listPatientReservations: vi.fn(),
  recordConsent: vi.fn(),
  requestPatientLiveAvailability: vi.fn(),
  searchPatientMedicine: vi.fn(),
}));

vi.mock('@/lib/browser-permissions', () => ({
  requestCurrentLocation: vi.fn(),
}));

vi.mock('@/components/permission-explanation-dialog', () => ({
  PermissionExplanationDialog: ({
    open,
    onContinue,
    onAlternative,
  }: {
    open: boolean;
    onContinue: () => void;
    onAlternative: () => void;
  }) =>
    open ? (
      <div role="dialog" aria-label="Location explanation">
        <button type="button" onClick={onContinue}>
          Continue with location
        </button>
        <button type="button" onClick={onAlternative}>
          Use manual location
        </button>
      </div>
    ) : null,
}));

const uuid = (suffix: string) => `10000000-0000-4000-8000-${suffix.padStart(12, '0')}`;

const availableResult = {
  productId: uuid('1'),
  providerId: uuid('2'),
  providerName: 'Central Pharmacy',
  providerCity: 'Bengaluru',
  providerState: 'Karnataka',
  name: 'Paracetamol',
  genericName: 'Paracetamol',
  brand: 'AIM Test',
  strength: '500 mg',
  dosageForm: 'TABLET',
  requiresPrescription: false,
  availability: 'AVAILABLE' as const,
  confirmationSource: 'PHARMACY_CONFIRMED' as const,
  confirmedAt: '2026-09-12T12:00:00.000Z',
  requestId: null,
  requestStatus: 'NONE' as const,
  requestedAt: null,
  expiresAt: null,
  retryAfterAt: null,
  distanceKm: null,
};

const unknownResult = {
  ...availableResult,
  availability: 'UNKNOWN' as const,
  confirmationSource: null,
  confirmedAt: null,
};

const reservation = {
  id: uuid('3'),
  status: 'PENDING' as const,
  version: 1,
  expiresAt: '2026-09-12T13:00:00.000Z',
  createdAt: '2026-09-12T12:00:00.000Z',
  cancelledAt: null,
  expiredAt: null,
  providerId: uuid('2'),
  providerName: 'Central Pharmacy',
  providerCity: 'Bengaluru',
  providerState: 'Karnataka',
  items: [
    {
      productId: uuid('1'),
      name: 'Paracetamol',
      genericName: 'Paracetamol',
      brand: 'AIM Test',
      strength: '500 mg',
      dosageForm: 'TABLET',
      quantity: 1,
    },
  ],
  totalQuantity: 1,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listPatientReservations).mockResolvedValue({
    data: [],
    total: 0,
    limit: 20,
    offset: 0,
  });
});

afterEach(() => cleanup());

function renderWorkspace() {
  return render(
    <LanguageProvider initialLocale="en">
      <PatientMedicinesWorkspace />
    </LanguageProvider>,
  );
}

async function searchFor(
  result: Awaited<ReturnType<typeof searchPatientMedicine>>['data'][number] = availableResult,
) {
  vi.mocked(searchPatientMedicine).mockResolvedValue({
    data: [result],
    limit: 20,
    offset: 0,
    radiusKm: null,
    area: { city: 'Bengaluru', state: 'Karnataka' },
  });

  fireEvent.change(screen.getByLabelText('Medicine name'), {
    target: { value: 'paracetamol' },
  });
  fireEvent.change(screen.getByLabelText('City'), { target: { value: 'Bengaluru' } });
  fireEvent.change(screen.getByLabelText('State'), { target: { value: 'Karnataka' } });
  fireEvent.click(screen.getByRole('button', { name: 'Search' }));

  await screen.findByText(result.name);
}

describe('PatientMedicinesWorkspace', () => {
  it('does not request browser location on render and keeps manual search available', async () => {
    renderWorkspace();

    expect(await screen.findByText('You have no reservations yet.')).toBeVisible();
    expect(requestCurrentLocation).not.toHaveBeenCalled();
    expect(screen.getByLabelText('City')).toBeEnabled();
    expect(screen.getByLabelText('State')).toBeEnabled();
  });

  it('performs a bounded manual search and can reserve an AVAILABLE result', async () => {
    vi.mocked(createPatientReservation).mockResolvedValue({
      reservationId: uuid('3'),
      status: 'PENDING',
      version: 1,
      itemCount: 1,
      totalQuantity: 1,
      expiresAt: '2026-09-12T13:00:00.000Z',
      replayed: false,
    });
    renderWorkspace();
    await screen.findByText('You have no reservations yet.');

    await searchFor();
    expect(searchPatientMedicine).toHaveBeenCalledWith(
      {
        q: 'paracetamol',
        city: 'Bengaluru',
        state: 'Karnataka',
        limit: 20,
        offset: 0,
      },
      expect.any(AbortSignal),
    );

    const reserve = screen.getByRole('button', { name: 'Reserve' });
    expect(reserve).toBeEnabled();
    fireEvent.click(reserve);

    await waitFor(() =>
      expect(createPatientReservation).toHaveBeenCalledWith({
        providerId: uuid('2'),
        items: [{ productId: uuid('1'), quantity: 1 }],
        idempotencyKey: expect.any(String),
      }),
    );
    expect(await screen.findByText('Reservation created.')).toBeVisible();
  });

  it('uses precise coordinates only after browser permission and LOCATION_USE consent both succeed', async () => {
    vi.mocked(requestCurrentLocation).mockResolvedValue({
      state: 'granted',
      position: {
        coords: { latitude: 12.9716, longitude: 77.5946 },
      },
    } as never);
    vi.mocked(recordConsent).mockRejectedValue(new Error('consent unavailable'));

    renderWorkspace();
    await screen.findByText('You have no reservations yet.');
    fireEvent.change(screen.getByLabelText('Medicine name'), {
      target: { value: 'paracetamol' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Use my location' }));

    expect(requestCurrentLocation).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Continue with location' }));

    await waitFor(() => expect(requestCurrentLocation).toHaveBeenCalledTimes(1));
    expect(recordConsent).toHaveBeenCalledWith({
      category: 'LOCATION_USE',
      status: 'GRANTED',
      source: 'nearby_search_prompt',
    });
    expect(searchPatientMedicine).not.toHaveBeenCalled();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your location could not be determined. Try again.',
    );
  });

  it('applies a pharmacist live resolution so AVAILABLE enables reservation immediately', async () => {
    vi.mocked(requestPatientLiveAvailability).mockResolvedValue({
      requestId: uuid('4'),
      requestStatus: 'PENDING',
      requestedAt: '2026-09-12T12:00:00.000Z',
      expiresAt: '2026-09-12T12:10:00.000Z',
      respondedAt: null,
      availabilityState: 'CONFIRMATION_REQUIRED',
      confirmationSource: null,
      confirmedAt: null,
      retryAfterAt: null,
    });
    vi.mocked(getPatientLiveAvailabilityStatus).mockResolvedValue({
      requestId: uuid('4'),
      requestStatus: 'RESPONDED',
      requestedAt: '2026-09-12T12:00:00.000Z',
      expiresAt: '2026-09-12T12:10:00.000Z',
      respondedAt: '2026-09-12T12:01:00.000Z',
      availabilityState: 'AVAILABLE',
      confirmationSource: 'PHARMACY_CONFIRMED',
      confirmedAt: '2026-09-12T12:01:00.000Z',
      retryAfterAt: null,
    });

    renderWorkspace();
    await screen.findByText('You have no reservations yet.');
    await searchFor(unknownResult);

    expect(screen.getByRole('button', { name: 'Reserve' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Ask pharmacy to check' }));
    expect(await screen.findByText('Waiting for the pharmacy to confirm')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Check status' }));
    expect(await screen.findByText('Available')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Reserve' })).toBeEnabled();
  });

  it('cancels only the authenticated patient reservation using its current version', async () => {
    vi.mocked(listPatientReservations)
      .mockResolvedValueOnce({ data: [reservation], total: 1, limit: 20, offset: 0 })
      .mockResolvedValueOnce({
        data: [
          {
            ...reservation,
            status: 'CANCELLED',
            version: 2,
            cancelledAt: '2026-09-12T12:10:00.000Z',
          },
        ],
        total: 1,
        limit: 20,
        offset: 0,
      });
    vi.mocked(cancelPatientReservation).mockResolvedValue({
      reservationId: reservation.id,
      status: 'CANCELLED',
      version: 2,
      totalQuantity: 1,
      replayed: false,
    });

    renderWorkspace();
    const cancel = await screen.findByRole('button', { name: 'Cancel reservation' });
    fireEvent.click(cancel);

    await waitFor(() =>
      expect(cancelPatientReservation).toHaveBeenCalledWith(reservation.id, {
        expectedVersion: 1,
        idempotencyKey: expect.any(String),
      }),
    );
    expect(
      await screen.findByText('Reservation cancelled and the held medicine released.'),
    ).toBeVisible();
    expect(await screen.findByText('Cancelled')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Cancel reservation' })).not.toBeInTheDocument();
  });
});
