import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, getAssignedProviders, getProviderExpiryWorklist } from '@/lib/api-client';
import type { InventoryExpiryWorklistPage, ProviderAccess } from '@/lib/inventory-contract';
import { validExpiryWorklistPage, validProviders } from '@/test/inventory-fixtures';
import { ExpiryWorklistWorkspace } from './expiry-worklist-workspace';

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return { ...actual, getAssignedProviders: vi.fn(), getProviderExpiryWorklist: vi.fn() };
});

const providers = structuredClone(validProviders) as unknown as ProviderAccess[];
const page = structuredClone(validExpiryWorklistPage) as unknown as InventoryExpiryWorklistPage;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getAssignedProviders).mockResolvedValue(providers);
  vi.mocked(getProviderExpiryWorklist).mockResolvedValue(page);
});
afterEach(() => cleanup());

// Below `lg`, the workspace renders a mobile card list alongside the
// desktop table (CSS-hidden, not removed from the DOM) -- jsdom does not
// apply CSS, so both are visible to queries. Scope row-content queries to
// the desktop table, same convention as the other Task 4 workspaces.
async function findTable() {
  return screen.findByRole('table');
}

describe('ExpiryWorklistWorkspace live integration', () => {
  it('renders exact physical evidence and current-page metrics without mutation claims', async () => {
    render(<ExpiryWorklistWorkspace />);
    const scope = within(await findTable());
    expect(await scope.findByText('Metformin 500 mg')).toBeVisible();
    expect(scope.getByText('BATCH-1')).toBeVisible();
    expect(metric('Available units')).toHaveTextContent('17');
    expect(scope.getByText('17')).toBeVisible();
    expect(screen.getByText(/Observed .* through .* 30 total/)).toBeVisible();
    expect(
      screen.queryByRole('button', { name: /quarantine|release|dispose/i }),
    ).not.toBeInTheDocument();
  });

  it('loads the selected assigned provider and bounded horizon', async () => {
    render(<ExpiryWorklistWorkspace />);
    await within(await findTable()).findByText('Metformin 500 mg');
    fireEvent.change(screen.getByLabelText('Expiry horizon'), { target: { value: '90' } });
    await waitFor(() =>
      expect(getProviderExpiryWorklist).toHaveBeenLastCalledWith({
        providerId: providers[0].providerId,
        horizonDays: 90,
        limit: 25,
        offset: 0,
      }),
    );
  });

  it('paginates with accepted offsets', async () => {
    render(<ExpiryWorklistWorkspace />);
    fireEvent.click(await screen.findByRole('button', { name: 'Next' }));
    await waitFor(() =>
      expect(getProviderExpiryWorklist).toHaveBeenLastCalledWith({
        providerId: providers[0].providerId,
        horizonDays: 30,
        limit: 25,
        offset: 25,
      }),
    );
  });

  it('renders both the desktop table and a mobile card list from the same data', async () => {
    render(<ExpiryWorklistWorkspace />);
    const table = await screen.findByRole('table');
    await within(table).findByText('BATCH-1');
    const batchMatches = screen.getAllByText('BATCH-1');
    expect(batchMatches.length).toBeGreaterThanOrEqual(2);
    expect(getProviderExpiryWorklist).toHaveBeenCalledTimes(1);
  });

  it('shows a text expiry-urgency label alongside the date, not color alone', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-08-14T00:00:00.000Z'));
    vi.mocked(getProviderExpiryWorklist).mockResolvedValue({
      ...page,
      data: [{ ...page.data[0], expiryDate: '2026-08-20T00:00:00.000Z' }],
    });
    render(<ExpiryWorklistWorkspace />);
    const scope = within(await screen.findByRole('table'));
    await scope.findByText('BATCH-1');
    expect(scope.getByText('6d remaining')).toBeVisible();
    vi.useRealTimers();
  });

  it('renders bounded access and empty states', async () => {
    vi.mocked(getAssignedProviders).mockRejectedValueOnce(new ApiError('Permission denied', 403));
    const { unmount } = render(<ExpiryWorklistWorkspace />);
    expect(await screen.findByText('Expiry worklist access is not assigned')).toBeVisible();
    unmount();
    vi.mocked(getAssignedProviders).mockResolvedValueOnce(providers);
    vi.mocked(getProviderExpiryWorklist).mockResolvedValueOnce({ ...page, data: [], total: 0 });
    render(<ExpiryWorklistWorkspace />);
    expect(
      await screen.findByText('No active on-hand batches expire in this horizon'),
    ).toBeVisible();
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
