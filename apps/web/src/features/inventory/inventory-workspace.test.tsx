import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '@/components/language-provider';
import {
  ApiError,
  getAssignedProviders,
  getProviderStock,
  quarantineBatch,
  recordCompletedTransfer,
  recordDamagedStock,
} from '@/lib/api-client';
import type {
  BatchQuarantineResponse,
  InventoryStockPage,
  ProviderAccess,
} from '@/lib/inventory-contract';
import { InventoryWorkspace } from './inventory-workspace';

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return {
    ...actual,
    getAssignedProviders: vi.fn(),
    getProviderStock: vi.fn(),
    quarantineBatch: vi.fn(),
    recordCompletedTransfer: vi.fn(),
    recordDamagedStock: vi.fn(),
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
  vi.mocked(recordDamagedStock).mockResolvedValue({
    providerId: providers[0].providerId,
    inventoryId: page.data[0].inventoryId,
    productId: page.data[0].productId,
    batchId: page.data[0].batches[0].id,
    movementId: '52f2d7a4-0948-49c4-a0a8-afbf88503a5c',
    quantity: 2,
    onHandBefore: 20,
    onHandAfter: 18,
    resultingBatchVersion: 5,
    occurredAt: '2026-08-14T02:00:00.000Z',
    replayed: false,
  });
  vi.mocked(recordCompletedTransfer).mockResolvedValue({
    transferId: '52f2d7a4-0948-49c4-a0a8-afbf88503a5c',
    productId: page.data[0].productId,
    sourceProviderId: providers[0].providerId,
    destinationProviderId: providers[1].providerId,
    sourceInventoryId: page.data[0].inventoryId,
    destinationInventoryId: 'd63f50dd-49b0-4a77-bc04-f7d00db58dd5',
    sourceBatchId: page.data[0].batches[0].id,
    destinationBatchId: 'c3a97ec4-84f8-4a85-a493-b8d6feb84a27',
    sourceMovementId: 'a2f2d7a4-0948-49c4-a0a8-afbf88503a5c',
    destinationMovementId: 'b2f2d7a4-0948-49c4-a0a8-afbf88503a5c',
    quantity: 2,
    sourceOnHandAfter: 18,
    destinationOnHandAfter: 7,
    sourceBatchVersion: 5,
    destinationBatchVersion: 3,
    completedAt: '2026-08-14T04:00:00.000Z',
    replayed: false,
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// Below `lg`, InventoryTable renders a mobile card list alongside the
// desktop table (CSS-hidden via Tailwind, not removed from the DOM) --
// jsdom does not apply CSS, so both are visible to queries. Scope
// row-content and action-button queries to the desktop table, the
// same convention already used for the platform shell's dual mobile
// drawer/desktop sidebar in app-shell.test.tsx.
async function findTable() {
  return screen.findByRole('table');
}

function renderWorkspace() {
  return render(
    <LanguageProvider initialLocale="en">
      <InventoryWorkspace />
    </LanguageProvider>,
  );
}

describe('InventoryWorkspace live integration', () => {
  it('renders live accepted fields and current-page metrics without preview claims', async () => {
    renderWorkspace();
    const scope = within(await findTable());
    expect(await scope.findByText('Metformin 500 mg')).toBeVisible();
    expect(metric('Available units')).toHaveTextContent('17');
    expect(scope.getByText('BATCH-1')).toBeVisible();
    expect(
      screen.queryByText(/Preview data|sample inventory|reorder|location/i),
    ).not.toBeInTheDocument();
  });

  it('changes assigned provider and applies server-side search', async () => {
    renderWorkspace();
    await within(await findTable()).findByText('Metformin 500 mg');
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
    renderWorkspace();
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
    renderWorkspace();
    fireEvent.click(
      within(await findTable()).getByRole('button', { name: 'Quarantine batch BATCH-1' }),
    );
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
    renderWorkspace();
    fireEvent.click(
      within(await findTable()).getByRole('button', { name: 'Quarantine batch BATCH-1' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Confirm quarantine' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to quarantine this batch.');
    expect(screen.getByRole('dialog')).toBeVisible();
  });

  it('dismisses the quarantine confirmation dialog on Escape', async () => {
    renderWorkspace();
    fireEvent.click(
      within(await findTable()).getByRole('button', { name: 'Quarantine batch BATCH-1' }),
    );
    expect(screen.getByRole('dialog')).toBeVisible();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(quarantineBatch).not.toHaveBeenCalled();
  });

  it('does not dismiss the quarantine dialog on Escape while the submission is in flight', async () => {
    const pendingQuarantine = deferred<BatchQuarantineResponse>();
    vi.mocked(quarantineBatch).mockReturnValueOnce(pendingQuarantine.promise);
    renderWorkspace();
    fireEvent.click(
      within(await findTable()).getByRole('button', { name: 'Quarantine batch BATCH-1' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Confirm quarantine' }));
    expect(await screen.findByText('Quarantining…')).toBeVisible();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('dialog')).toBeVisible();

    pendingQuarantine.resolve({
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

  it('records only a confirmed available damaged quantity and refreshes live stock', async () => {
    vi.stubGlobal('crypto', { randomUUID: () => '22222222-2222-4222-8222-222222222222' });
    renderWorkspace();
    fireEvent.click(
      within(await findTable()).getByRole('button', { name: 'Record damage for batch BATCH-1' }),
    );
    expect(screen.getByRole('dialog')).toHaveTextContent('does not claim disposal or approval');
    fireEvent.change(screen.getByLabelText('Damaged quantity'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Confirmed damage reason'), {
      target: { value: ' Two sealed packs were physically damaged during handling. ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm damaged stock' }));

    await waitFor(() =>
      expect(recordDamagedStock).toHaveBeenCalledWith(
        providers[0].providerId,
        page.data[0].batches[0].id,
        {
          expectedVersion: 4,
          quantity: 2,
          idempotencyKey: 'damaged-stock-22222222-2222-4222-8222-222222222222',
          reason: 'Two sealed packs were physically damaged during handling.',
        },
      ),
    );
    expect(await screen.findByText(/20 → 18/)).toBeVisible();
    expect(getProviderStock).toHaveBeenCalledTimes(2);
  });

  it('rejects damage above available stock before the API call', async () => {
    renderWorkspace();
    fireEvent.click(
      within(await findTable()).getByRole('button', { name: 'Record damage for batch BATCH-1' }),
    );
    fireEvent.change(screen.getByLabelText('Damaged quantity'), { target: { value: '18' } });
    fireEvent.change(screen.getByLabelText('Confirmed damage reason'), {
      target: { value: 'Confirmed physical damage.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm damaged stock' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('valid available quantity');
    expect(recordDamagedStock).not.toHaveBeenCalled();
  });

  it('records only a completed physical transfer and refreshes source stock', async () => {
    vi.stubGlobal('crypto', { randomUUID: () => '44444444-4444-4444-8444-444444444444' });
    renderWorkspace();
    fireEvent.click(
      within(await findTable()).getByRole('button', {
        name: 'Record completed transfer for batch BATCH-1',
      }),
    );
    expect(screen.getByRole('dialog')).toHaveTextContent('does not create a shipment');
    fireEvent.change(screen.getByLabelText('Transfer quantity'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Transfer reason'), {
      target: { value: ' Stock already moved between assigned locations. ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm completed transfer' }));

    await waitFor(() =>
      expect(recordCompletedTransfer).toHaveBeenCalledWith(providers[0].providerId, {
        destinationProviderId: providers[1].providerId,
        sourceBatchId: page.data[0].batches[0].id,
        expectedSourceVersion: 4,
        quantity: 2,
        idempotencyKey: 'completed-transfer-44444444-4444-4444-8444-444444444444',
        reason: 'Stock already moved between assigned locations.',
      }),
    );
    expect(await screen.findByText(/Source on-hand is now 18/)).toBeVisible();
    expect(getProviderStock).toHaveBeenCalledTimes(2);
  });

  it('rejects a transfer above available stock before the API call', async () => {
    renderWorkspace();
    fireEvent.click(
      within(await findTable()).getByRole('button', {
        name: 'Record completed transfer for batch BATCH-1',
      }),
    );
    fireEvent.change(screen.getByLabelText('Transfer quantity'), { target: { value: '18' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm completed transfer' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('valid available quantity');
    expect(recordCompletedTransfer).not.toHaveBeenCalled();
  });

  it('shows assignment-empty and permission-restricted states', async () => {
    vi.mocked(getAssignedProviders).mockResolvedValueOnce([]);
    const { unmount } = renderWorkspace();
    expect(
      await screen.findByRole('heading', { name: 'No active provider assignment' }),
    ).toBeVisible();
    unmount();
    vi.mocked(getAssignedProviders).mockRejectedValueOnce(new ApiError('Permission denied', 403));
    renderWorkspace();
    expect(
      await screen.findByRole('heading', { name: 'Inventory access is not assigned' }),
    ).toBeVisible();
  });

  it('renders both the desktop table and a mobile card list from the same data', async () => {
    renderWorkspace();
    await within(await findTable()).findByText('Metformin 500 mg');
    // The mobile list is a <ul> sibling structure, not a table -- it exists
    // for narrow viewports (CSS-hidden above lg, not a separate fetch/data
    // path), so the same product name appears in both without a second
    // network call.
    const lists = screen.getAllByText('Metformin 500 mg');
    expect(lists.length).toBeGreaterThanOrEqual(2);
    expect(getProviderStock).toHaveBeenCalledTimes(1);
  });

  it('shows an urgency chip only for batches that are overdue or within 7 days, not distant ones', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-08-20T00:00:00.000Z'));
    vi.mocked(getProviderStock).mockResolvedValue({
      ...page,
      data: [
        {
          ...page.data[0],
          batches: [
            {
              ...page.data[0].batches[0],
              id: 'urgent-batch',
              batchNumber: 'BATCH-URGENT',
              expiryDate: '2026-08-25T00:00:00.000Z',
            },
            {
              ...page.data[0].batches[0],
              id: 'distant-batch',
              batchNumber: 'BATCH-DISTANT',
              expiryDate: '2027-01-01T00:00:00.000Z',
            },
          ],
        },
      ],
    });
    renderWorkspace();
    const scope = within(await findTable());
    await scope.findByText('BATCH-URGENT');
    expect(scope.getByText('Expires in 5d')).toBeVisible();
    expect(scope.getByText('BATCH-DISTANT')).toBeVisible();
    // Only one urgency chip should exist -- the distant batch gets none.
    expect(scope.getAllByText(/Expires in \d+d|Overdue/)).toHaveLength(1);
    vi.useRealTimers();
  });
});

function metric(label: string) {
  const card = screen
    .getAllByText(label)
    .map((element) => element.closest('article'))
    .find((element) => element !== null);
  expect(card).not.toBeNull();
  return card!;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((fulfil) => {
    resolve = fulfil;
  });
  return { promise, resolve };
}
