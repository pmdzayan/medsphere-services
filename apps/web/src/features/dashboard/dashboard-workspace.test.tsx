import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  getAssignedProviders,
  getProviderReservations,
  getProviderStock,
} from '@/lib/api-client';
import type { InventoryStockPage, ProviderAccess } from '@/lib/inventory-contract';
import type { ProviderReservationPage } from '@/lib/reservation-contract';
import { validStockPage } from '@/test/inventory-fixtures';
import { validReservationPage } from '@/test/reservation-fixtures';
import { DashboardWorkspace } from './dashboard-workspace';

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return {
    ...actual,
    getAssignedProviders: vi.fn(),
    getProviderStock: vi.fn(),
    getProviderReservations: vi.fn(),
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

const stockPage: InventoryStockPage = {
  ...(structuredClone(validStockPage) as InventoryStockPage),
  total: 27,
  limit: 10,
};
const reservationPage: ProviderReservationPage = {
  ...(structuredClone(validReservationPage) as ProviderReservationPage),
  total: 19,
  limit: 10,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getAssignedProviders).mockResolvedValue(providers);
  vi.mocked(getProviderStock).mockResolvedValue(stockPage);
  vi.mocked(getProviderReservations).mockResolvedValue(reservationPage);
});

afterEach(() => cleanup());

describe('DashboardWorkspace live operations overview', () => {
  it('loads each accepted boundary independently with exact bounded requests', async () => {
    render(<DashboardWorkspace />);

    expect(screen.getByRole('status')).toHaveTextContent('Checking assigned providers');
    expect(await screen.findByText('Metformin 500 mg')).toBeVisible();
    expect(getProviderStock).toHaveBeenCalledWith({
      providerId: providers[0].providerId,
      limit: 10,
      offset: 0,
    });
    expect(getProviderReservations).toHaveBeenCalledWith({
      providerId: providers[0].providerId,
      limit: 10,
      offset: 0,
    });

    for (const call of [
      vi.mocked(getProviderStock).mock.calls[0]?.[0],
      vi.mocked(getProviderReservations).mock.calls[0]?.[0],
    ]) {
      expect(Object.keys(call ?? {}).sort()).toEqual(['limit', 'offset', 'providerId']);
      expect(JSON.stringify(call)).not.toMatch(
        /tenant|membership|role|permission|user|access.?token/i,
      );
    }
  });

  it('renders accepted current-page calculations, rows, exact result counts, and links', async () => {
    render(<DashboardWorkspace />);
    expect(await screen.findByText('Metformin 500 mg')).toBeVisible();

    expect(metric('Products')).toHaveTextContent('1');
    expect(metric('Batches')).toHaveTextContent('1');
    expect(metric('On-hand units')).toHaveTextContent('20');
    expect(metric('Held units')).toHaveTextContent('3');
    expect(metric('Available units')).toHaveTextContent('17');
    expect(metric('Reservations')).toHaveTextContent('1');
    expect(metric('Medicine units')).toHaveTextContent('2');
    expect(metric('Pending or confirmed')).toHaveTextContent('1');
    expect(metric('Ready')).toHaveTextContent('0');
    expect(screen.getAllByText('Current page')).toHaveLength(9);
    expect(screen.getByText('27 exact results')).toBeVisible();
    expect(screen.getByText('19 exact results')).toBeVisible();
    expect(screen.getByText('F63F50DD')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Open Inventory' })).toHaveAttribute(
      'href',
      '/inventory',
    );
    expect(screen.getByRole('link', { name: 'Open Reservations' })).toHaveAttribute(
      'href',
      '/reservations',
    );
  });

  it('shows independent loading states without presenting unloaded metrics as zero', async () => {
    vi.mocked(getProviderStock).mockReturnValueOnce(pending());
    vi.mocked(getProviderReservations).mockReturnValueOnce(pending());
    render(<DashboardWorkspace />);

    expect(await screen.findByText('Loading current-page stock…')).toBeVisible();
    expect(screen.getByText('Loading current-page reservations…')).toBeVisible();
    expect(metric('Products')).toHaveTextContent('—');
    expect(metric('Reservations')).toHaveTextContent('—');
  });

  it('changes provider and replaces both datasets with new bounded requests', async () => {
    render(<DashboardWorkspace />);
    await screen.findByText('Metformin 500 mg');
    fireEvent.change(screen.getByLabelText('Assigned provider'), {
      target: { value: providers[1].providerId },
    });

    await waitFor(() => {
      expect(getProviderStock).toHaveBeenLastCalledWith({
        providerId: providers[1].providerId,
        limit: 10,
        offset: 0,
      });
      expect(getProviderReservations).toHaveBeenLastCalledWith({
        providerId: providers[1].providerId,
        limit: 10,
        offset: 0,
      });
    });
  });

  it('ignores late responses from the previously selected provider', async () => {
    const oldStock = deferred<InventoryStockPage>();
    const oldReservations = deferred<ProviderReservationPage>();
    const cityStock: InventoryStockPage = {
      ...stockPage,
      data: [{ ...stockPage.data[0], inventoryId: providers[1].providerId, name: 'City Aspirin' }],
    };
    vi.mocked(getProviderStock).mockImplementation(({ providerId }) =>
      providerId === providers[0].providerId ? oldStock.promise : Promise.resolve(cityStock),
    );
    vi.mocked(getProviderReservations).mockImplementation(({ providerId }) =>
      providerId === providers[0].providerId
        ? oldReservations.promise
        : Promise.resolve(reservationPage),
    );

    render(<DashboardWorkspace />);
    await screen.findByText(/Showing bounded reads for Central Pharmacy/);
    fireEvent.change(screen.getByLabelText('Assigned provider'), {
      target: { value: providers[1].providerId },
    });
    expect(await screen.findByText('City Aspirin')).toBeVisible();

    oldStock.resolve(stockPage);
    oldReservations.resolve(reservationPage);
    await waitFor(() => expect(screen.queryByText('Metformin 500 mg')).not.toBeInTheDocument());
    expect(screen.getByText('City Aspirin')).toBeVisible();
  });

  it('handles an empty assignment and retries provider loading after unauthenticated failure', async () => {
    vi.mocked(getAssignedProviders).mockResolvedValueOnce([]);
    const { unmount } = render(<DashboardWorkspace />);
    expect(
      await screen.findByRole('heading', { name: 'No active provider assignment' }),
    ).toBeVisible();
    expect(getProviderStock).not.toHaveBeenCalled();
    expect(getProviderReservations).not.toHaveBeenCalled();
    unmount();
    vi.mocked(getAssignedProviders).mockClear();

    vi.mocked(getAssignedProviders)
      .mockRejectedValueOnce(new ApiError('Authentication required', 401))
      .mockResolvedValueOnce(providers);
    render(<DashboardWorkspace />);
    expect(
      await screen.findByRole('heading', { name: 'Your session must be verified' }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Retry provider access' }));
    expect(await screen.findByText('Metformin 500 mg')).toBeVisible();
    expect(getAssignedProviders).toHaveBeenCalledTimes(2);
  });

  it('shows restricted provider access and fails closed for a malformed provider response', async () => {
    vi.mocked(getAssignedProviders).mockRejectedValueOnce(new ApiError('Permission denied', 403));
    const { unmount } = render(<DashboardWorkspace />);
    expect(await screen.findByRole('heading', { name: 'Access is restricted' })).toBeVisible();
    unmount();

    vi.mocked(getAssignedProviders).mockRejectedValueOnce(
      new ApiError('Assigned-provider response was invalid.', 502),
    );
    render(<DashboardWorkspace />);
    expect(await screen.findByText('Assigned-provider response was invalid.')).toBeVisible();
    expect(
      screen.queryByLabelText('Current-page reservation status counts'),
    ).not.toBeInTheDocument();
  });

  it('keeps reservations visible when stock fails and retries stock independently', async () => {
    vi.mocked(getProviderStock)
      .mockRejectedValueOnce(new ApiError('Stock response was invalid.', 502))
      .mockResolvedValueOnce(stockPage);
    render(<DashboardWorkspace />);

    expect(await screen.findByText('Stock response was invalid.')).toBeVisible();
    expect(screen.getByText('F63F50DD')).toBeVisible();
    fireEvent.click(screen.getAllByRole('button', { name: 'Retry stock' }).at(-1)!);
    expect(await screen.findByText('Metformin 500 mg')).toBeVisible();
    expect(getProviderStock).toHaveBeenCalledTimes(2);
    expect(getProviderReservations).toHaveBeenCalledTimes(1);
  });

  it('keeps stock visible when reservations fail and retries reservations independently', async () => {
    vi.mocked(getProviderReservations)
      .mockRejectedValueOnce(new ApiError('Reservation response was invalid.', 502))
      .mockResolvedValueOnce(reservationPage);
    render(<DashboardWorkspace />);

    expect(await screen.findByText('Reservation response was invalid.')).toBeVisible();
    expect(screen.getByText('Metformin 500 mg')).toBeVisible();
    fireEvent.click(screen.getAllByRole('button', { name: 'Retry reservations' }).at(-1)!);
    expect(await screen.findByText('F63F50DD')).toBeVisible();
    expect(getProviderReservations).toHaveBeenCalledTimes(2);
    expect(getProviderStock).toHaveBeenCalledTimes(1);
  });

  it('renders independent empty stock and reservation responses', async () => {
    vi.mocked(getProviderStock).mockResolvedValueOnce({ ...stockPage, data: [], total: 0 });
    vi.mocked(getProviderReservations).mockResolvedValueOnce({
      ...reservationPage,
      data: [],
      total: 0,
    });
    render(<DashboardWorkspace />);

    expect(await screen.findByRole('heading', { name: 'No stock records' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'No reservation records' })).toBeVisible();
    expect(metric('Products')).toHaveTextContent('0');
    expect(metric('Reservations')).toHaveTextContent('0');
  });

  it('contains no fabricated analytics, patient identity, activity, or mutation controls', async () => {
    render(<DashboardWorkspace />);
    await screen.findByText('Metformin 500 mg');
    const prohibited =
      /inventory value|stock health|low stock|reorder|critical|expiry risk|days of cover|recent activity|pickup time|payment status|delivery status|goods receipt|fulfilment/i;
    expect(document.body.textContent).not.toMatch(prohibited);
    expect(document.body.textContent).not.toMatch(/Rohan Kumar|Farah Malik|Aditya Nair/i);
    expect(
      screen.queryByRole('button', {
        name: /receive|adjust|create|transition|transfer|return|damage|confirm|complete|cancel/i,
      }),
    ).not.toBeInTheDocument();
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

function pending<T>(): Promise<T> {
  return new Promise<T>(() => undefined);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((fulfil) => {
    resolve = fulfil;
  });
  return { promise, resolve };
}
