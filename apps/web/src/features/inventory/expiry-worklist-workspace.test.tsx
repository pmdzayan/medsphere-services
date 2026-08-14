import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

describe('ExpiryWorklistWorkspace live integration', () => {
  it('renders exact physical evidence and current-page metrics without mutation claims', async () => {
    render(<ExpiryWorklistWorkspace />);
    expect(await screen.findByText('Metformin 500 mg')).toBeVisible();
    expect(screen.getByText('BATCH-1')).toBeVisible();
    expect(screen.getAllByText('17')).toHaveLength(2);
    expect(screen.getByText(/Observed .* through .* 30 total/)).toBeVisible();
    expect(
      screen.queryByRole('button', { name: /quarantine|release|dispose/i }),
    ).not.toBeInTheDocument();
  });

  it('loads the selected assigned provider and bounded horizon', async () => {
    render(<ExpiryWorklistWorkspace />);
    await screen.findByText('Metformin 500 mg');
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
