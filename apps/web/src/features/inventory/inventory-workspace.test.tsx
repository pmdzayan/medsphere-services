import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  getAssignedProviders,
  getProviderStock,
  quarantineBatch,
} from '@/lib/api-client';
import type { InventoryStockPage, ProviderAccess } from '@/lib/inventory-contract';
import { InventoryWorkspace } from './inventory-workspace';

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return {
    ...actual,
    getAssignedProviders: vi.fn(),
    getProviderStock: vi.fn(),
    quarantineBatch: vi.fn(),
  };
});

const providers: ProviderAccess[] = [
  {
    membershipId: 'fcb65cb7-9071-40eb-ab52-878978d9031c',
    providerId: '7f51a0f3-3bd1-45d7-85f3-b8b725969df9',
    businessName: 'Central Pharmacy',
    providerType: 'PHARMACY',
    isActive: true,
  },
  {
    membershipId: 'fcb65cb7-9071-40eb-ab52-878978d9031c',
    providerId: '8b4d574f-48c6-4231-8851-e65edc9f9d42',
    businessName: 'City Hospital',
    providerType: 'HOSPITAL',
    isActive: true,
  },
];
const page: InventoryStockPage = {
  data: [
    {
      inventoryId: 'f63f50dd-49b0-4a77-bc04-f7d00db58dd5',
      productId: '73a97ec4-84f8-4a85-a493-b8d6feb84a27',
      name: 'Metformin 500 mg',
      genericName: 'Metformin hydrochloride',
      brand: 'Example Brand',
      sku: 'MET-500',
      sellingPrice: '12.50',
      mrp: '15.00',
      isVisible: true,
      totalOnHandQuantity: 20,
      totalHeldQuantity: 3,
      totalAvailableQuantity: 17,
      batches: [
        {
          id: '9b4d574f-48c6-4231-8851-e65edc9f9d42',
          batchNumber: 'BATCH-1',
          expiryDate: '2027-08-01T00:00:00.000Z',
          manufacturingDate: null,
          status: 'ACTIVE',
          version: 4,
          onHandQuantity: 20,
          heldQuantity: 3,
          availableQuantity: 17,
        },
      ],
    },
  ],
  total: 30,
  limit: 25,
  offset: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getAssignedProviders).mockResolvedValue(providers);
  vi.mocked(getProviderStock).mockResolvedValue(page);
  vi.mocked(quarantineBatch).mockResolvedValue({
    batchId: page.data[0].batches[0].id,
    status: 'QUARANTINED',
    reasonCode: 'TEMPERATURE_EXCURSION',
    onHandQuantity: 20,
    affectedReservationCount: 1,
    releasedUnitCount: 3,
    resultingBatchVersion: 5,
    occurredAt: '2026-08-14T01:00:00.000Z',
    replayed: false,
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('InventoryWorkspace live integration', () => {
  it('renders live accepted fields and current-page metrics without preview claims', async () => {
    render(<InventoryWorkspace />);
    expect(await screen.findByText('Metformin 500 mg')).toBeVisible();
    expect(screen.getAllByText('17')).toHaveLength(2);
    expect(screen.getByText('BATCH-1')).toBeVisible();
    expect(
      screen.queryByText(/Preview data|sample inventory|reorder|location/i),
    ).not.toBeInTheDocument();
  });

  it('changes assigned provider and applies server-side search', async () => {
    render(<InventoryWorkspace />);
    await screen.findByText('Metformin 500 mg');
    fireEvent.change(screen.getByLabelText('Assigned provider'), {
      target: { value: providers[1].providerId },
    });
    await waitFor(() =>
      expect(getProviderStock).toHaveBeenLastCalledWith({
        providerId: providers[1].providerId,
        query: undefined,
        limit: 25,
        offset: 0,
      }),
    );
    fireEvent.change(screen.getByLabelText('Product search'), { target: { value: ' aspirin ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() =>
      expect(getProviderStock).toHaveBeenLastCalledWith({
        providerId: providers[1].providerId,
        query: 'aspirin',
        limit: 25,
        offset: 0,
      }),
    );
  });

  it('paginates with accepted offsets', async () => {
    render(<InventoryWorkspace />);
    fireEvent.click(await screen.findByRole('button', { name: 'Next' }));
    await waitFor(() =>
      expect(getProviderStock).toHaveBeenLastCalledWith({
        providerId: providers[0].providerId,
        query: undefined,
        limit: 25,
        offset: 25,
      }),
    );
  });

  it('confirms a version-safe one-way quarantine and refreshes live stock', async () => {
    vi.stubGlobal('crypto', { randomUUID: () => '11111111-1111-4111-8111-111111111111' });
    render(<InventoryWorkspace />);
    fireEvent.click(await screen.findByRole('button', { name: 'Quarantine batch BATCH-1' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('cannot be reversed in V1');
    fireEvent.change(screen.getByLabelText('Quarantine reason'), {
      target: { value: 'TEMPERATURE_EXCURSION' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm quarantine' }));

    await waitFor(() =>
      expect(quarantineBatch).toHaveBeenCalledWith(
        providers[0].providerId,
        page.data[0].batches[0].id,
        {
          expectedVersion: 4,
          idempotencyKey: 'batch-quarantine-11111111-1111-4111-8111-111111111111',
          reasonCode: 'TEMPERATURE_EXCURSION',
        },
      ),
    );
    expect(await screen.findByRole('status')).toHaveTextContent(
      '1 reservation(s) were cancelled and 3 held unit(s) were released',
    );
    expect(getProviderStock).toHaveBeenCalledTimes(2);
  });

  it('keeps the confirmation open and surfaces bounded mutation errors', async () => {
    vi.mocked(quarantineBatch).mockRejectedValueOnce(new ApiError('Batch version conflict', 409));
    render(<InventoryWorkspace />);
    fireEvent.click(await screen.findByRole('button', { name: 'Quarantine batch BATCH-1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm quarantine' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Batch version conflict');
    expect(screen.getByRole('dialog')).toBeVisible();
  });

  it('shows assignment-empty and permission-restricted states', async () => {
    vi.mocked(getAssignedProviders).mockResolvedValueOnce([]);
    const { unmount } = render(<InventoryWorkspace />);
    expect(
      await screen.findByRole('heading', { name: 'No active provider assignment' }),
    ).toBeVisible();
    unmount();
    vi.mocked(getAssignedProviders).mockRejectedValueOnce(new ApiError('Permission denied', 403));
    render(<InventoryWorkspace />);
    expect(
      await screen.findByRole('heading', { name: 'Inventory access is not assigned' }),
    ).toBeVisible();
  });
});
