import { StrictMode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '@/components/language-provider';
import { getAssignedProviders, getInventoryAnalytics } from '@/lib/api-client';
import type { ProviderAccess } from '@/lib/inventory-contract';
import type { InventoryAnalyticsResponse } from '@/lib/inventory-analytics-contract';
import { InventoryAnalyticsWorkspace } from './inventory-analytics-workspace';

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return { ...actual, getAssignedProviders: vi.fn(), getInventoryAnalytics: vi.fn() };
});

beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  cleanup();
  window.localStorage.clear();
  document.cookie.split(';').forEach((cookie) => {
    const name = cookie.split('=')[0]?.trim();
    if (name) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  });
});

function renderWorkspace() {
  return render(
    <LanguageProvider>
      <InventoryAnalyticsWorkspace />
    </LanguageProvider>,
  );
}

const PROVIDER_A: ProviderAccess = {
  membershipId: 'membership-1',
  providerId: '33333333-3333-4333-8333-333333333333',
  businessName: 'Pharmacy A',
  providerType: 'PHARMACY',
  isActive: true,
};
const PROVIDER_B: ProviderAccess = {
  membershipId: 'membership-2',
  providerId: '44444444-4444-4444-8444-444444444444',
  businessName: 'Pharmacy B',
  providerType: 'PHARMACY',
  isActive: true,
};

function makeAnalytics(
  overrides: Partial<InventoryAnalyticsResponse> = {},
): InventoryAnalyticsResponse {
  return {
    providerId: PROVIDER_A.providerId,
    generatedAt: new Date('2027-01-01T10:00:00.000Z').toISOString(),
    inventory: {
      distinctProductCount: 10,
      activeBatchCount: 20,
      availableQuantity: 500,
      heldQuantity: 50,
      unavailableProductCount: 1,
      lowStockProductCount: 2,
    },
    reservations: {
      pending: 1,
      confirmed: 2,
      ready: 3,
      completed: 4,
      cancelled: 5,
      expired: 6,
      activeCount: 6,
      heldQuantity: 30,
    },
    expiry: { expiredBatchCount: 1, nearExpiryBatchCount: 2, horizonDays: 30 },
    quality: { quarantinedBatchCount: 1, damagedMovementCount: 3 },
    transfers: { completedCount: 5 },
    attentionItems: [
      {
        id: '11111111-1111-4111-8111-111111111111',
        type: 'NEAR_EXPIRY_BATCH',
        severity: 'ATTENTION',
        providerId: PROVIDER_A.providerId,
        sourceResourceType: 'Batch',
        sourceResourceId: '22222222-2222-4222-8222-222222222222',
        occurredAt: null,
        dueAt: new Date('2027-01-10T00:00:00.000Z').toISOString(),
      },
    ],
    ...overrides,
  };
}

const ALL_ZERO_ANALYTICS = makeAnalytics({
  inventory: {
    distinctProductCount: 0,
    activeBatchCount: 0,
    availableQuantity: 0,
    heldQuantity: 0,
    unavailableProductCount: 0,
    lowStockProductCount: 0,
  },
  reservations: {
    pending: 0,
    confirmed: 0,
    ready: 0,
    completed: 0,
    cancelled: 0,
    expired: 0,
    activeCount: 0,
    heldQuantity: 0,
  },
  expiry: { expiredBatchCount: 0, nearExpiryBatchCount: 0, horizonDays: 30 },
  quality: { quarantinedBatchCount: 0, damagedMovementCount: 0 },
  transfers: { completedCount: 0 },
  attentionItems: [],
});

describe('InventoryAnalyticsWorkspace -- loading and provider assignment (candidate Task 0038)', () => {
  it('shows a loading state while providers are being fetched', async () => {
    vi.mocked(getAssignedProviders).mockImplementation(() => new Promise(() => {}));
    renderWorkspace();
    expect(await screen.findAllByRole('status')).not.toHaveLength(0);
  });

  it('shows a loading state while analytics load after provider selection', async () => {
    vi.mocked(getAssignedProviders).mockResolvedValue([PROVIDER_A]);
    vi.mocked(getInventoryAnalytics).mockImplementation(() => new Promise(() => {}));
    renderWorkspace();
    expect(await screen.findAllByRole('status')).not.toHaveLength(0);
  });

  it('the "no assigned providers" empty state is shown, not an error', async () => {
    vi.mocked(getAssignedProviders).mockResolvedValue([]);
    renderWorkspace();
    expect(await screen.findByText('You have no assigned pharmacies.')).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('exactly one assigned provider is auto-selected', async () => {
    vi.mocked(getAssignedProviders).mockResolvedValue([PROVIDER_A]);
    vi.mocked(getInventoryAnalytics).mockResolvedValue(makeAnalytics());
    renderWorkspace();
    await waitFor(() =>
      expect(getInventoryAnalytics).toHaveBeenCalledWith(
        PROVIDER_A.providerId,
        30,
        expect.anything(),
      ),
    );
  });

  it('multiple assigned providers are all offered, with the first auto-selected', async () => {
    vi.mocked(getAssignedProviders).mockResolvedValue([PROVIDER_A, PROVIDER_B]);
    vi.mocked(getInventoryAnalytics).mockResolvedValue(makeAnalytics());
    renderWorkspace();
    await waitFor(() =>
      expect(getInventoryAnalytics).toHaveBeenCalledWith(
        PROVIDER_A.providerId,
        30,
        expect.anything(),
      ),
    );
    const select = screen.getByLabelText('Pharmacy') as HTMLSelectElement;
    expect(within(select).getAllByRole('option')).toHaveLength(2);
  });

  it('a provider fetch failure shows a bounded error, not a crash', async () => {
    vi.mocked(getAssignedProviders).mockRejectedValue(new Error('network'));
    renderWorkspace();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not load your assigned pharmacies.',
    );
  });

  it('provider switching triggers a new analytics request for the newly selected provider', async () => {
    vi.mocked(getAssignedProviders).mockResolvedValue([PROVIDER_A, PROVIDER_B]);
    vi.mocked(getInventoryAnalytics).mockResolvedValue(makeAnalytics());
    renderWorkspace();
    await waitFor(() => expect(getInventoryAnalytics).toHaveBeenCalledTimes(1));
    const select = screen.getByLabelText('Pharmacy');
    fireEvent.change(select, { target: { value: PROVIDER_B.providerId } });
    await waitFor(() =>
      expect(getInventoryAnalytics).toHaveBeenCalledWith(
        PROVIDER_B.providerId,
        30,
        expect.anything(),
      ),
    );
  });
});

describe('InventoryAnalyticsWorkspace -- successful rendering (candidate Task 0038)', () => {
  it('renders every section with the correct returned values', async () => {
    vi.mocked(getAssignedProviders).mockResolvedValue([PROVIDER_A]);
    vi.mocked(getInventoryAnalytics).mockResolvedValue(makeAnalytics());
    renderWorkspace();
    expect(await screen.findByText('10')).toBeVisible();
    expect(screen.getByText('500')).toBeVisible();
    expect(screen.getByText('50')).toBeVisible();
    expect(screen.getByText('Batch approaching expiry')).toBeVisible();
  });

  it('renders the generated-at freshness label using non-real-time wording', async () => {
    vi.mocked(getAssignedProviders).mockResolvedValue([PROVIDER_A]);
    vi.mocked(getInventoryAnalytics).mockResolvedValue(makeAnalytics());
    renderWorkspace();
    const label = await screen.findByText(/Generated/);
    expect(label.textContent).not.toMatch(/live/i);
    expect(label.textContent).not.toMatch(/real-time/i);
  });
});

describe('InventoryAnalyticsWorkspace -- zero data is valid, not an error (candidate Task 0038)', () => {
  it('renders all-zero analytics without any error state', async () => {
    vi.mocked(getAssignedProviders).mockResolvedValue([PROVIDER_A]);
    vi.mocked(getInventoryAnalytics).mockResolvedValue(ALL_ZERO_ANALYTICS);
    renderWorkspace();
    await screen.findByText('Pharmacy Analytics');
    await waitFor(() => expect(getInventoryAnalytics).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('Nothing needs attention right now.')).toBeVisible();
  });
});

describe('InventoryAnalyticsWorkspace -- STALE RESPONSE RACES (candidate Task 0038, mandatory)', () => {
  it('provider race: A starts, user switches to B, B resolves first, A resolves after -- UI must still show B', async () => {
    vi.mocked(getAssignedProviders).mockResolvedValue([PROVIDER_A, PROVIDER_B]);
    let resolveA: (value: InventoryAnalyticsResponse) => void = () => {};
    const promiseA = new Promise<InventoryAnalyticsResponse>((resolve) => (resolveA = resolve));
    vi.mocked(getInventoryAnalytics)
      .mockImplementationOnce(() => promiseA)
      .mockImplementationOnce(() =>
        Promise.resolve(
          makeAnalytics({
            providerId: PROVIDER_B.providerId,
            inventory: { ...makeAnalytics().inventory, distinctProductCount: 999 },
          }),
        ),
      );
    renderWorkspace();
    await waitFor(() => expect(getInventoryAnalytics).toHaveBeenCalledTimes(1));

    const select = screen.getByLabelText('Pharmacy');
    fireEvent.change(select, { target: { value: PROVIDER_B.providerId } });
    await screen.findByText('999');

    resolveA(makeAnalytics({ providerId: PROVIDER_A.providerId }));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(screen.queryByText('10')).not.toBeInTheDocument();
    expect(screen.getByText('999')).toBeVisible();
  });

  it('horizon race: a request for the initial horizon is still pending, user switches horizon, the newer request resolves first and wins even when the older one resolves afterward', async () => {
    vi.mocked(getAssignedProviders).mockResolvedValue([PROVIDER_A]);
    let resolveFirst: (value: InventoryAnalyticsResponse) => void = () => {};
    const firstPromise = new Promise<InventoryAnalyticsResponse>(
      (resolve) => (resolveFirst = resolve),
    );
    vi.mocked(getInventoryAnalytics)
      .mockImplementationOnce(() => firstPromise)
      .mockImplementationOnce(() =>
        Promise.resolve(
          makeAnalytics({
            expiry: { expiredBatchCount: 1, nearExpiryBatchCount: 777, horizonDays: 60 },
          }),
        ),
      );
    renderWorkspace();
    await waitFor(() => expect(getInventoryAnalytics).toHaveBeenCalledTimes(1));

    const horizonSelect = screen.getByLabelText('Near-expiry horizon');
    fireEvent.change(horizonSelect, { target: { value: '60' } });
    await screen.findByText('777');

    resolveFirst(
      makeAnalytics({
        expiry: { expiredBatchCount: 1, nearExpiryBatchCount: 111, horizonDays: 30 },
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(screen.queryByText('111')).not.toBeInTheDocument();
    expect(screen.getByText('777')).toBeVisible();
  });

  it('the horizon selector only ever offers the canonical values 7/30/60/90, never a malformed value like "07"', async () => {
    vi.mocked(getAssignedProviders).mockResolvedValue([PROVIDER_A]);
    vi.mocked(getInventoryAnalytics).mockResolvedValue(makeAnalytics());
    renderWorkspace();
    const select = (await screen.findByLabelText('Near-expiry horizon')) as HTMLSelectElement;
    const values = Array.from(select.options).map((o) => o.value);
    expect(values).toEqual(['7', '30', '60', '90']);
    expect(values).not.toContain('07');
  });
});

describe('InventoryAnalyticsWorkspace -- error/retry (candidate Task 0038)', () => {
  it('an analytics failure shows a bounded error with retry', async () => {
    vi.mocked(getAssignedProviders).mockResolvedValue([PROVIDER_A]);
    vi.mocked(getInventoryAnalytics).mockRejectedValue(new Error('network'));
    renderWorkspace();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not load pharmacy analytics. Try again.',
    );
  });

  it('retry re-invokes analytics for the current provider and horizon, and can recover', async () => {
    vi.mocked(getAssignedProviders).mockResolvedValue([PROVIDER_A]);
    vi.mocked(getInventoryAnalytics)
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(makeAnalytics());
    renderWorkspace();
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(getInventoryAnalytics).toHaveBeenCalledTimes(2));
    expect(getInventoryAnalytics).toHaveBeenNthCalledWith(
      2,
      PROVIDER_A.providerId,
      30,
      expect.anything(),
    );
    expect(await screen.findByText('Batch approaching expiry')).toBeVisible();
  });

  it('a stale prior request cannot overwrite a successful newer one', async () => {
    vi.mocked(getAssignedProviders).mockResolvedValue([PROVIDER_A]);
    let rejectFirst: (error: Error) => void = () => {};
    const firstPromise = new Promise<InventoryAnalyticsResponse>(
      (_resolve, reject) => (rejectFirst = reject),
    );
    vi.mocked(getInventoryAnalytics)
      .mockImplementationOnce(() => firstPromise)
      .mockResolvedValueOnce(
        makeAnalytics({ inventory: { ...makeAnalytics().inventory, distinctProductCount: 42 } }),
      );
    renderWorkspace();
    await waitFor(() => expect(getInventoryAnalytics).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText('Near-expiry horizon'), { target: { value: '60' } });
    await screen.findByText('42');
    rejectFirst(new Error('late failure'));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(screen.getByText('42')).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('InventoryAnalyticsWorkspace -- copy/semantics (candidate Task 0038)', () => {
  it('damagedMovementCount is presented as "Recorded damage incidents", never "damaged stock"/"damaged quantity"', async () => {
    vi.mocked(getAssignedProviders).mockResolvedValue([PROVIDER_A]);
    vi.mocked(getInventoryAnalytics).mockResolvedValue(makeAnalytics());
    renderWorkspace();
    expect(await screen.findByText('Recorded damage incidents')).toBeVisible();
    expect(screen.queryByText(/damaged stock/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/damaged quantity/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/current damaged/i)).not.toBeInTheDocument();
  });

  it('transfers are presented only as "Completed transfers" -- no pending/in-progress copy', async () => {
    vi.mocked(getAssignedProviders).mockResolvedValue([PROVIDER_A]);
    vi.mocked(getInventoryAnalytics).mockResolvedValue(makeAnalytics());
    renderWorkspace();
    expect(await screen.findByText('Completed transfers')).toBeVisible();
    expect(screen.queryByText(/pending transfer/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/in-progress transfer/i)).not.toBeInTheDocument();
  });

  it('low-stock copy explains configured minimum-stock levels, not a universal AIM threshold', async () => {
    vi.mocked(getAssignedProviders).mockResolvedValue([PROVIDER_A]);
    vi.mocked(getInventoryAnalytics).mockResolvedValue(makeAnalytics());
    renderWorkspace();
    const explanation = await screen.findByText(/configured minimum stock level/i);
    expect(explanation).toBeVisible();
    expect(explanation.textContent).not.toMatch(/one AIM-wide threshold|universal threshold/i);
  });

  it('expired and near-expiry remain visually distinct labeled metrics, never merged', async () => {
    vi.mocked(getAssignedProviders).mockResolvedValue([PROVIDER_A]);
    vi.mocked(getInventoryAnalytics).mockResolvedValue(makeAnalytics());
    renderWorkspace();
    expect(await screen.findByText('Expired batches')).toBeVisible();
    expect(screen.getByText('Near-expiry batches')).toBeVisible();
  });
});

describe('InventoryAnalyticsWorkspace -- attention items (candidate Task 0038)', () => {
  it('renders a bounded empty state when there are zero attention items', async () => {
    vi.mocked(getAssignedProviders).mockResolvedValue([PROVIDER_A]);
    vi.mocked(getInventoryAnalytics).mockResolvedValue(makeAnalytics({ attentionItems: [] }));
    renderWorkspace();
    expect(await screen.findByText('Nothing needs attention right now.')).toBeVisible();
  });

  it('renders a populated NEAR_EXPIRY_BATCH item with visible, localized severity text (not the raw backend enum, not color-only)', async () => {
    vi.mocked(getAssignedProviders).mockResolvedValue([PROVIDER_A]);
    vi.mocked(getInventoryAnalytics).mockResolvedValue(makeAnalytics());
    renderWorkspace();
    expect(await screen.findByText('Attention')).toBeVisible();
    // The raw backend enum value must never appear as visible text.
    expect(screen.queryByText('ATTENTION')).not.toBeInTheDocument();
  });

  it('the due date is formatted through the locale, not rendered as a raw ISO string, while the machine-readable ISO value remains in the <time> element', async () => {
    vi.mocked(getAssignedProviders).mockResolvedValue([PROVIDER_A]);
    vi.mocked(getInventoryAnalytics).mockResolvedValue(makeAnalytics());
    renderWorkspace();
    await screen.findByText('Batch approaching expiry');
    const timeElement = document.querySelector('time');
    expect(timeElement?.getAttribute('datetime')).toBe(
      new Date('2027-01-10T00:00:00.000Z').toISOString(),
    );
    expect(timeElement?.textContent).not.toBe(new Date('2027-01-10T00:00:00.000Z').toISOString());
    expect(timeElement?.textContent).toMatch(/2027/);
  });

  it('never renders patient-sensitive text', async () => {
    vi.mocked(getAssignedProviders).mockResolvedValue([PROVIDER_A]);
    vi.mocked(getInventoryAnalytics).mockResolvedValue(makeAnalytics());
    renderWorkspace();
    await screen.findByText('Batch approaching expiry');
    const rendered = document.body.textContent ?? '';
    expect(rendered).not.toMatch(/@/);
    expect(rendered.toLowerCase()).not.toContain('diagnosis');
    expect(rendered.toLowerCase()).not.toContain('prescription');
  });
});

describe('InventoryAnalyticsWorkspace -- accessibility (candidate Task 0038)', () => {
  it('has exactly one h1 page heading', async () => {
    vi.mocked(getAssignedProviders).mockResolvedValue([PROVIDER_A]);
    vi.mocked(getInventoryAnalytics).mockResolvedValue(makeAnalytics());
    renderWorkspace();
    await screen.findByText('Batch approaching expiry');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('the provider selector has an accessible name', async () => {
    vi.mocked(getAssignedProviders).mockResolvedValue([PROVIDER_A]);
    vi.mocked(getInventoryAnalytics).mockResolvedValue(makeAnalytics());
    renderWorkspace();
    expect(await screen.findByLabelText('Pharmacy')).toBeInTheDocument();
  });

  it('the horizon selector has an accessible name', async () => {
    vi.mocked(getAssignedProviders).mockResolvedValue([PROVIDER_A]);
    vi.mocked(getInventoryAnalytics).mockResolvedValue(makeAnalytics());
    renderWorkspace();
    expect(await screen.findByLabelText('Near-expiry horizon')).toBeInTheDocument();
  });

  it('major sections use semantic h2 headings', async () => {
    vi.mocked(getAssignedProviders).mockResolvedValue([PROVIDER_A]);
    vi.mocked(getInventoryAnalytics).mockResolvedValue(makeAnalytics());
    renderWorkspace();
    await screen.findByText('Batch approaching expiry');
    const h2s = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(h2s).toEqual(
      expect.arrayContaining([
        'Inventory health',
        'Reservations',
        'Expiry',
        'Quality',
        'Transfers',
        'Needs attention',
      ]),
    );
  });

  it('error/retry state is accessible via role="alert" and a named button', async () => {
    vi.mocked(getAssignedProviders).mockResolvedValue([PROVIDER_A]);
    vi.mocked(getInventoryAnalytics).mockRejectedValue(new Error('network'));
    renderWorkspace();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});

describe('InventoryAnalyticsWorkspace -- StrictMode safety (candidate Task 0038)', () => {
  it('renders correct, non-duplicated analytics state under StrictMode', async () => {
    vi.mocked(getAssignedProviders).mockResolvedValue([PROVIDER_A]);
    vi.mocked(getInventoryAnalytics).mockResolvedValue(makeAnalytics());
    render(
      <StrictMode>
        <LanguageProvider>
          <InventoryAnalyticsWorkspace />
        </LanguageProvider>
      </StrictMode>,
    );
    expect(await screen.findByText('Batch approaching expiry')).toBeVisible();
    expect(screen.getAllByText('Batch approaching expiry')).toHaveLength(1);
  });

  it('stale-request protection remains active under StrictMode: an unmount/cleanup mid-flight cannot cause a crash or a stale commit', async () => {
    vi.mocked(getAssignedProviders).mockResolvedValue([PROVIDER_A]);
    let resolveFirst: (value: InventoryAnalyticsResponse) => void = () => {};
    const firstPromise = new Promise<InventoryAnalyticsResponse>(
      (resolve) => (resolveFirst = resolve),
    );
    vi.mocked(getInventoryAnalytics).mockImplementation(() => firstPromise);
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { unmount } = render(
      <StrictMode>
        <LanguageProvider>
          <InventoryAnalyticsWorkspace />
        </LanguageProvider>
      </StrictMode>,
    );
    await waitFor(() => expect(getInventoryAnalytics).toHaveBeenCalled());
    unmount();
    resolveFirst(makeAnalytics());
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(consoleErrorSpy).not.toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });
});
