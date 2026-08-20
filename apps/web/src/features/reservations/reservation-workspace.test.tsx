import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  createProviderReservation,
  getAssignedProviders,
  getProviderReservations,
  getProviderStock,
  transitionProviderReservation,
} from '@/lib/api-client';
import type { InventoryStockPage, ProviderAccess } from '@/lib/inventory-contract';
import type { ProviderReservationPage } from '@/lib/reservation-contract';
import { validReservationPage } from '@/test/reservation-fixtures';
import { validStockPage } from '@/test/inventory-fixtures';
import { ReservationWorkspace } from './reservation-workspace';

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return {
    ...actual,
    getAssignedProviders: vi.fn(),
    getProviderReservations: vi.fn(),
    getProviderStock: vi.fn(),
    createProviderReservation: vi.fn(),
    transitionProviderReservation: vi.fn(),
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
const page = structuredClone(validReservationPage) as unknown as ProviderReservationPage;
const stockPage = structuredClone(validStockPage) as unknown as InventoryStockPage;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getAssignedProviders).mockResolvedValue(providers);
  vi.mocked(getProviderReservations).mockResolvedValue({ ...page, total: 30 });
  vi.mocked(getProviderStock).mockResolvedValue(stockPage);
  vi.mocked(createProviderReservation).mockResolvedValue({
    reservationId: '73a97ec4-84f8-4a85-a493-b8d6feb84a27',
    status: 'PENDING',
    version: 1,
    itemCount: 1,
    totalQuantity: 2,
    replayed: false,
  });
  vi.mocked(transitionProviderReservation).mockResolvedValue({
    reservationId: page.data[0].id,
    status: 'READY',
    version: 3,
    totalQuantity: 2,
    replayed: false,
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('ReservationWorkspace live integration', () => {
  it('renders accepted live fields and expands details without patient claims', async () => {
    render(<ReservationWorkspace />);
    fireEvent.click(
      within(await screen.findByRole('table')).getByRole('button', {
        name: /View reservation .* details/,
      }),
    );
    expect(await screen.findByText('Metformin 500 mg')).toBeVisible();
    expect(screen.getByText(/BATCH-1 · 2 · Held/)).toBeVisible();
    expect(screen.queryByText(/Rohan Kumar|Farah Malik|Aditya Nair/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mark ready' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeVisible();
  });

  it('confirms a version-safe lifecycle action and refreshes reservations', async () => {
    vi.stubGlobal('crypto', { randomUUID: () => '33333333-3333-4333-8333-333333333333' });
    render(<ReservationWorkspace />);
    fireEvent.click(
      within(await screen.findByRole('table')).getByRole('button', {
        name: /View reservation .* details/,
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Mark ready' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('recheck provider assignment');
    fireEvent.click(screen.getByRole('button', { name: 'Confirm mark ready' }));

    await waitFor(() =>
      expect(transitionProviderReservation).toHaveBeenCalledWith(
        providers[0].providerId,
        page.data[0].id,
        {
          transition: 'READY',
          expectedVersion: 2,
          idempotencyKey: 'reservation-ready-33333333-3333-4333-8333-333333333333',
        },
      ),
    );
    expect(await screen.findByRole('status')).toHaveTextContent('now Ready at version 3');
    expect(getProviderReservations).toHaveBeenCalledTimes(2);
  });

  it('creates a single-product FEFO reservation and refreshes authoritative records', async () => {
    vi.stubGlobal('crypto', { randomUUID: () => '33333333-3333-4333-8333-333333333333' });
    render(<ReservationWorkspace />);
    fireEvent.click(await screen.findByRole('button', { name: 'New reservation' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('No name, contact, prescription, clinical');
    fireEvent.change(screen.getByLabelText('Tenant user ID'), {
      target: { value: 'f63f50dd-49b0-4a77-bc04-f7d00db58dd5' },
    });
    fireEvent.change(screen.getByLabelText('Reservation quantity'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Reservation expiry'), {
      target: { value: '2027-08-01T12:00' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm reservation' }));

    await waitFor(() =>
      expect(createProviderReservation).toHaveBeenCalledWith(providers[0].providerId, {
        subjectUserId: 'f63f50dd-49b0-4a77-bc04-f7d00db58dd5',
        expiresAt: new Date('2027-08-01T12:00').toISOString(),
        items: [{ productId: validStockPage.data[0].productId, quantity: 2 }],
        idempotencyKey: 'reservation-create-33333333-3333-4333-8333-333333333333',
      }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent('is Pending with 2 held unit');
    expect(getProviderReservations).toHaveBeenCalledTimes(2);
  });

  it('keeps creation confirmation open on a stock conflict', async () => {
    vi.mocked(createProviderReservation).mockRejectedValueOnce(
      new ApiError('Insufficient eligible stock', 409),
    );
    render(<ReservationWorkspace />);
    fireEvent.click(await screen.findByRole('button', { name: 'New reservation' }));
    fireEvent.change(await screen.findByLabelText('Tenant user ID'), {
      target: { value: 'f63f50dd-49b0-4a77-bc04-f7d00db58dd5' },
    });
    fireEvent.change(screen.getByLabelText('Reservation expiry'), {
      target: { value: '2027-08-01T12:00' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm reservation' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Insufficient eligible stock');
    expect(screen.getByRole('dialog')).toBeVisible();
  });

  it('keeps confirmation open on a bounded lifecycle conflict', async () => {
    vi.mocked(transitionProviderReservation).mockRejectedValueOnce(
      new ApiError('Medicine reservation version conflict', 409),
    );
    render(<ReservationWorkspace />);
    fireEvent.click(
      within(await screen.findByRole('table')).getByRole('button', {
        name: /View reservation .* details/,
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Mark ready' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm mark ready' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('version conflict');
    expect(screen.getByRole('dialog')).toBeVisible();
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

  it('renders both the desktop table and a mobile card list from the same data', async () => {
    render(<ReservationWorkspace />);
    const table = await screen.findByRole('table');
    await within(table).findByText(/Version/);
    const detailButtons = screen.getAllByRole('button', {
      name: /View reservation .* details/,
    });
    // One instance in the desktop table row, one in the mobile card --
    // both from the single fetched page, not a second request.
    expect(detailButtons.length).toBeGreaterThanOrEqual(2);
    expect(getProviderReservations).toHaveBeenCalledTimes(1);
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
