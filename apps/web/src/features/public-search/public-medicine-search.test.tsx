import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '@/components/language-provider';
import { ApiError, searchNearbyMedicine, searchPublicMedicine } from '@/lib/api-client';
import type { PublicMedicineSearchResult } from '@/lib/public-medicine-search-contract';
import { PublicMedicineSearch } from './public-medicine-search';

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return {
    ...actual,
    searchPublicMedicine: vi.fn(),
    searchNearbyMedicine: vi.fn(),
  };
});

const providerId = '11111111-1111-4111-8111-111111111111';

function mockGeolocationSuccess(latitude = 12.9716, longitude = 77.5946) {
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      getCurrentPosition: vi.fn((success: PositionCallback) =>
        success({
          coords: {
            latitude,
            longitude,
            accuracy: 10,
            altitude: null,
            altitudeAccuracy: null,
            heading: null,
            speed: null,
          },
          timestamp: Date.now(),
          toJSON: () => ({}),
        } as GeolocationPosition),
      ),
    },
  });
}

function mockGeolocationDenied() {
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      getCurrentPosition: vi.fn((_success: PositionCallback, error: PositionErrorCallback) =>
        error({
          code: 1,
          message: 'denied',
          PERMISSION_DENIED: 1,
          POSITION_UNAVAILABLE: 2,
          TIMEOUT: 3,
        } as GeolocationPositionError),
      ),
    },
  });
}

const inStockResult: PublicMedicineSearchResult = {
  productId: '22222222-2222-4222-8222-222222222222',
  providerId,
  providerName: 'Fixture Pharmacy',
  providerCity: 'Chennai',
  providerState: 'Tamil Nadu',
  name: 'Paracetamol 500mg',
  genericName: 'Paracetamol',
  brand: 'Fixture Brand',
  strength: '500 mg',
  dosageForm: 'TABLET',
  requiresPrescription: false,
  availability: 'IN_STOCK',
};

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderSearch() {
  return render(
    <LanguageProvider>
      <PublicMedicineSearch providerId={providerId} />
    </LanguageProvider>,
  );
}

function fillAndSubmit(term: string) {
  fireEvent.change(screen.getByLabelText('Medicine name'), { target: { value: term } });
  fireEvent.click(screen.getByRole('button', { name: 'Search' }));
}

describe('PublicMedicineSearch', () => {
  it('renders real search results without prior data', async () => {
    vi.mocked(searchPublicMedicine).mockResolvedValue({
      data: [inStockResult],
      limit: 20,
      offset: 0,
    });
    renderSearch();

    fillAndSubmit('paracetamol');

    expect(await screen.findByText('Paracetamol 500mg')).toBeVisible();
    expect(screen.getByText('In stock')).toBeVisible();
    expect(screen.getAllByText(/Fixture Pharmacy/).length).toBeGreaterThan(0);
    expect(searchPublicMedicine).toHaveBeenCalledWith(providerId, 'paracetamol');
  });

  it('shows an out-of-stock badge and a prescription-required badge accurately', async () => {
    vi.mocked(searchPublicMedicine).mockResolvedValue({
      data: [
        {
          ...inStockResult,
          availability: 'OUT_OF_STOCK',
          requiresPrescription: true,
        },
      ],
      limit: 20,
      offset: 0,
    });
    renderSearch();

    fillAndSubmit('paracetamol');

    expect(await screen.findByText('Out of stock')).toBeVisible();
    expect(screen.getByText('Prescription required')).toBeVisible();
  });

  it('shows an empty state with no fabricated results', async () => {
    vi.mocked(searchPublicMedicine).mockResolvedValue({ data: [], limit: 20, offset: 0 });
    renderSearch();

    fillAndSubmit('nonexistent-medicine');

    expect(await screen.findByText('No matches')).toBeVisible();
    expect(screen.getByText(/nonexistent-medicine/)).toBeVisible();
  });

  it('maps a backend failure to bounded localized copy without reflecting its message', async () => {
    vi.mocked(searchPublicMedicine).mockRejectedValue(
      new ApiError('unbounded backend English must not be reflected', 404),
    );
    renderSearch();

    fillAndSubmit('paracetamol');

    expect(await screen.findByText('Pharmacy not found')).toBeVisible();
    expect(screen.getByText('Search is unavailable right now.')).toBeVisible();
    expect(
      screen.queryByText('unbounded backend English must not be reflected'),
    ).not.toBeInTheDocument();
  });

  it('shows a loading state and prevents duplicate submission while pending', async () => {
    const pending = deferred<{
      data: PublicMedicineSearchResult[];
      limit: number;
      offset: number;
    }>();
    vi.mocked(searchPublicMedicine).mockReturnValueOnce(pending.promise);
    renderSearch();

    fillAndSubmit('paracetamol');

    expect(await screen.findByText('Searching…')).toBeVisible();
    const submit = screen.getByRole('button', { name: 'Searching…' });
    expect(submit).toBeDisabled();

    fireEvent.click(submit);
    expect(searchPublicMedicine).toHaveBeenCalledTimes(1);

    pending.resolve({ data: [inStockResult], limit: 20, offset: 0 });
    expect(await screen.findByText('Paracetamol 500mg')).toBeVisible();
  });

  it('does not submit an empty search', () => {
    renderSearch();
    expect(screen.getByRole('button', { name: 'Search' })).toBeDisabled();
    expect(searchPublicMedicine).not.toHaveBeenCalled();
  });

  it('switches public search UI to Tamil while preserving catalog data', () => {
    renderSearch();
    fireEvent.change(screen.getByLabelText('Language'), { target: { value: 'ta' } });

    expect(screen.getByText('மருந்து கிடைப்பைச் சரிபார்க்கவும்')).toBeVisible();
    expect(screen.getByLabelText('மருந்தின் பெயர்')).toBeVisible();
    expect(screen.getByRole('button', { name: 'தேடுக' })).toBeDisabled();
  });

  it('uses browser geolocation for nearby medicine search and renders distance', async () => {
    mockGeolocationSuccess(12.9716, 77.5946);

    vi.mocked(searchNearbyMedicine).mockResolvedValue({
      data: [
        {
          ...inStockResult,
          distanceKm: 1.4,
        },
      ],
      limit: 20,
      offset: 0,
      radiusKm: 10,
    });

    renderSearch();

    fireEvent.change(screen.getByLabelText('Medicine name'), {
      target: { value: 'paracetamol' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Find near me' }));

    expect(await screen.findByText('1.4 km away')).toBeVisible();

    expect(searchNearbyMedicine).toHaveBeenCalledWith({
      q: 'paracetamol',
      latitude: 12.9716,
      longitude: 77.5946,
      radiusKm: 10,
      limit: 20,
      offset: 0,
    });

    expect(searchPublicMedicine).not.toHaveBeenCalled();
  });

  it('shows a bounded error when location permission is denied', async () => {
    mockGeolocationDenied();

    renderSearch();

    fireEvent.change(screen.getByLabelText('Medicine name'), {
      target: { value: 'paracetamol' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Find near me' }));

    expect(
      await screen.findByText(
        'Location permission was denied. Allow location access to search nearby pharmacies.',
      ),
    ).toBeVisible();

    expect(searchNearbyMedicine).not.toHaveBeenCalled();
  });

  it('does not persist precise location coordinates in browser storage', async () => {
    mockGeolocationSuccess(12.9716, 77.5946);

    const storageSpy = vi.spyOn(Storage.prototype, 'setItem');

    vi.mocked(searchNearbyMedicine).mockResolvedValue({
      data: [],
      limit: 20,
      offset: 0,
      radiusKm: 10,
    });

    renderSearch();

    fireEvent.change(screen.getByLabelText('Medicine name'), {
      target: { value: 'paracetamol' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Find near me' }));

    await screen.findByText(/No matches/i);

    const serializedWrites = JSON.stringify(storageSpy.mock.calls);
    expect(serializedWrites).not.toContain('12.9716');
    expect(serializedWrites).not.toContain('77.5946');
    expect(storageSpy.mock.calls.some(([key]) => /latitude|longitude|location/i.test(key))).toBe(
      false,
    );
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((fulfil) => {
    resolve = fulfil;
  });
  return { promise, resolve };
}
