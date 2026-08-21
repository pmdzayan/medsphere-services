import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, searchPublicMedicine } from '@/lib/api-client';
import type { PublicMedicineSearchResult } from '@/lib/public-medicine-search-contract';
import { PublicMedicineSearch } from './public-medicine-search';

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return { ...actual, searchPublicMedicine: vi.fn() };
});

const providerId = '11111111-1111-4111-8111-111111111111';

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
});
afterEach(() => cleanup());

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
    render(<PublicMedicineSearch providerId={providerId} />);

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
    render(<PublicMedicineSearch providerId={providerId} />);

    fillAndSubmit('paracetamol');

    expect(await screen.findByText('Out of stock')).toBeVisible();
    expect(screen.getByText('Prescription required')).toBeVisible();
  });

  it('shows an empty state with no fabricated results', async () => {
    vi.mocked(searchPublicMedicine).mockResolvedValue({ data: [], limit: 20, offset: 0 });
    render(<PublicMedicineSearch providerId={providerId} />);

    fillAndSubmit('nonexistent-medicine');

    expect(await screen.findByText('No matches')).toBeVisible();
    expect(screen.getByText(/nonexistent-medicine/)).toBeVisible();
  });

  it('shows the exact server error message on failure', async () => {
    vi.mocked(searchPublicMedicine).mockRejectedValue(new ApiError('Provider not found', 404));
    render(<PublicMedicineSearch providerId={providerId} />);

    fillAndSubmit('paracetamol');

    expect(await screen.findByText('Pharmacy not found')).toBeVisible();
    expect(screen.getByText('Provider not found')).toBeVisible();
  });

  it('shows a loading state and prevents duplicate submission while pending', async () => {
    const pending = deferred<{
      data: PublicMedicineSearchResult[];
      limit: number;
      offset: number;
    }>();
    vi.mocked(searchPublicMedicine).mockReturnValueOnce(pending.promise);
    render(<PublicMedicineSearch providerId={providerId} />);

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
    render(<PublicMedicineSearch providerId={providerId} />);
    expect(screen.getByRole('button', { name: 'Search' })).toBeDisabled();
    expect(searchPublicMedicine).not.toHaveBeenCalled();
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((fulfil) => {
    resolve = fulfil;
  });
  return { promise, resolve };
}
