import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, getAssignedProviders, getProviderReservations } from '@/lib/api-client';
import type { ProviderAccess } from '@/lib/inventory-contract';
import type { ProviderReservationPage } from '@/lib/reservation-contract';
import { validReservationPage } from '@/test/reservation-fixtures';
import { ReservationWorkspace } from './reservation-workspace';

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return { ...actual, getAssignedProviders: vi.fn(), getProviderReservations: vi.fn() };
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
const page = structuredClone(validReservationPage) as ProviderReservationPage;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getAssignedProviders).mockResolvedValue(providers);
  vi.mocked(getProviderReservations).mockResolvedValue({ ...page, total: 30 });
});
afterEach(() => cleanup());

describe('ReservationWorkspace live integration', () => {
  it('renders accepted live fields and expands details without patient claims', async () => {
    render(<ReservationWorkspace />);
    fireEvent.click(await screen.findByRole('button', { name: /View reservation .* details/ }));
    expect(await screen.findByText('Metformin 500 mg')).toBeVisible();
    expect(screen.getByText(/BATCH-1 · 2 · Held/)).toBeVisible();
    expect(screen.queryByText(/Rohan Kumar|Farah Malik|Aditya Nair/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /confirm|ready|complete|cancel/i }),
    ).not.toBeInTheDocument();
  });

  it('changes provider and applies accepted status filtering', async () => {
    render(<ReservationWorkspace />);
    await screen.findByText('Confirmed');
    fireEvent.change(screen.getByLabelText('Assigned provider'), {
      target: { value: providers[1].providerId },
    });
    await waitFor(() =>
      expect(getProviderReservations).toHaveBeenLastCalledWith({
        providerId: providers[1].providerId,
        status: undefined,
        limit: 25,
        offset: 0,
      }),
    );
    fireEvent.change(screen.getByLabelText('Reservation status'), { target: { value: 'READY' } });
    await waitFor(() =>
      expect(getProviderReservations).toHaveBeenLastCalledWith({
        providerId: providers[1].providerId,
        status: 'READY',
        limit: 25,
        offset: 0,
      }),
    );
  });

  it('paginates with accepted offsets', async () => {
    render(<ReservationWorkspace />);
    fireEvent.click(await screen.findByRole('button', { name: 'Next' }));
    await waitFor(() =>
      expect(getProviderReservations).toHaveBeenLastCalledWith({
        providerId: providers[0].providerId,
        status: undefined,
        limit: 25,
        offset: 25,
      }),
    );
  });

  it('shows empty-assignment and permission-restricted states', async () => {
    vi.mocked(getAssignedProviders).mockResolvedValueOnce([]);
    const { unmount } = render(<ReservationWorkspace />);
    expect(
      await screen.findByRole('heading', { name: 'No active provider assignment' }),
    ).toBeVisible();
    unmount();
    vi.mocked(getAssignedProviders).mockRejectedValueOnce(new ApiError('Permission denied', 403));
    render(<ReservationWorkspace />);
    expect(
      await screen.findByRole('heading', { name: 'Reservation access is not assigned' }),
    ).toBeVisible();
  });
});
