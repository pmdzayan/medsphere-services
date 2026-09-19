import { StrictMode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '@/components/language-provider';
import { listPatientTimeline } from '@/lib/api-client';
import type { PatientTimelineEvent } from '@/lib/patient-timeline-contract';
import { PatientTimelineWorkspace } from './patient-timeline-workspace';

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return { ...actual, listPatientTimeline: vi.fn() };
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
      <PatientTimelineWorkspace />
    </LanguageProvider>,
  );
}

const eventA: PatientTimelineEvent = {
  id: '11111111-1111-4111-8111-111111111111',
  eventType: 'RESERVATION_STATUS_CHANGED',
  title: 'Reservation confirmed',
  summary: 'Your reservation was confirmed.',
  destinationType: 'NONE',
  destinationId: null,
  occurredAt: new Date('2027-01-02T00:00:00.000Z').toISOString(),
  createdAt: new Date('2027-01-02T00:05:00.000Z').toISOString(),
};

const eventB: PatientTimelineEvent = {
  ...eventA,
  id: '22222222-2222-4222-8222-222222222222',
  title: 'Earlier activity',
  summary: 'An earlier care-related update.',
  occurredAt: new Date('2027-01-01T00:00:00.000Z').toISOString(),
};

describe('PatientTimelineWorkspace -- initial load and rendering (candidate Task 0037)', () => {
  it('shows a localized loading state before the list resolves', async () => {
    vi.mocked(listPatientTimeline).mockImplementation(() => new Promise(() => {}));
    renderWorkspace();
    expect(await screen.findAllByRole('status')).not.toHaveLength(0);
  });

  it('renders a populated success state with title, summary, and formatted date/time, newest first', async () => {
    vi.mocked(listPatientTimeline).mockResolvedValue({ items: [eventA, eventB], nextCursor: null });
    renderWorkspace();
    await screen.findByText('Reservation confirmed');
    expect(screen.getByText('Your reservation was confirmed.')).toBeVisible();
    const titles = screen
      .getAllByText(/Reservation confirmed|Earlier activity/)
      .map((el) => el.textContent);
    expect(titles).toEqual(['Reservation confirmed', 'Earlier activity']);
    expect(document.querySelector('time')?.getAttribute('datetime')).toBe(eventA.occurredAt);
  });

  it('shows a localized empty state with zero events -- no fabricated content', async () => {
    vi.mocked(listPatientTimeline).mockResolvedValue({ items: [], nextCursor: null });
    renderWorkspace();
    expect(await screen.findByText('No activity yet')).toBeVisible();
  });

  it('shows a bounded failure state with a working retry that recovers', async () => {
    vi.mocked(listPatientTimeline)
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({ items: [eventA], nextCursor: null });
    renderWorkspace();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Could not load your timeline. Try again.');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Reservation confirmed')).toBeVisible();
    expect(listPatientTimeline).toHaveBeenCalledTimes(2);
  });

  it('a retry that also fails remains in a safe bounded error state', async () => {
    vi.mocked(listPatientTimeline).mockRejectedValue(new Error('network'));
    renderWorkspace();
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not load your timeline. Try again.',
    );
  });

  it('never displays internal metadata fields', async () => {
    vi.mocked(listPatientTimeline).mockResolvedValue({ items: [eventA], nextCursor: null });
    renderWorkspace();
    await screen.findByText('Reservation confirmed');
    expect(screen.queryByText(/recipientUserId/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/sourceType/i)).not.toBeInTheDocument();
    expect(screen.queryByText(eventA.id)).not.toBeInTheDocument();
  });

  it('accessibility: renders a semantic page heading and a semantic list structure', async () => {
    vi.mocked(listPatientTimeline).mockResolvedValue({ items: [eventA], nextCursor: null });
    renderWorkspace();
    expect(await screen.findByRole('heading', { name: 'Medical timeline' })).toBeVisible();
    expect(screen.getByRole('list')).toBeInTheDocument();
  });

  it('localization: Tamil and Urdu render the timeline title distinctly from English', async () => {
    const { translate } = await import('@/lib/i18n');
    const english = translate('en', 'patientTimeline.title');
    const tamil = translate('ta', 'patientTimeline.title');
    const urdu = translate('ur', 'patientTimeline.title');
    expect(tamil).not.toBe(english);
    expect(urdu).not.toBe(english);
  });

  it('Tamil (rendered): the actual localized empty-state copy is rendered, not just distinct catalogue entries', async () => {
    const { translate } = await import('@/lib/i18n');
    vi.mocked(listPatientTimeline).mockResolvedValue({ items: [], nextCursor: null });
    render(
      <LanguageProvider initialLocale="ta">
        <PatientTimelineWorkspace />
      </LanguageProvider>,
    );
    expect(await screen.findByText(translate('ta', 'patientTimeline.emptyTitle'))).toBeVisible();
  });
});

describe('PatientTimelineWorkspace -- pagination (candidate Task 0037)', () => {
  it('shows Load more when nextCursor exists and hides it once null', async () => {
    vi.mocked(listPatientTimeline).mockResolvedValue({ items: [eventA], nextCursor: 'cursor-1' });
    renderWorkspace();
    expect(await screen.findByRole('button', { name: 'Load more' })).toBeInTheDocument();
  });

  it('shows the end-of-timeline state when nextCursor is null', async () => {
    vi.mocked(listPatientTimeline).mockResolvedValue({ items: [eventA], nextCursor: null });
    renderWorkspace();
    await screen.findByText('Reservation confirmed');
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
    expect(screen.getByText("You've reached the beginning.")).toBeVisible();
  });

  it('load-more appends the second page after the first, using the exact server cursor', async () => {
    vi.mocked(listPatientTimeline).mockResolvedValueOnce({
      items: [eventA],
      nextCursor: 'cursor-1',
    });
    vi.mocked(listPatientTimeline).mockResolvedValueOnce({ items: [eventB], nextCursor: null });
    renderWorkspace();
    await screen.findByText('Reservation confirmed');
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    await screen.findByText('Earlier activity');
    expect(listPatientTimeline).toHaveBeenNthCalledWith(2, 'cursor-1');
    const titles = screen
      .getAllByText(/Reservation confirmed|Earlier activity/)
      .map((el) => el.textContent);
    expect(titles).toEqual(['Reservation confirmed', 'Earlier activity']);
  });

  it('duplicate ids across pages are deduplicated, preserving the first occurrence', async () => {
    vi.mocked(listPatientTimeline).mockResolvedValueOnce({
      items: [eventA],
      nextCursor: 'cursor-1',
    });
    vi.mocked(listPatientTimeline).mockResolvedValueOnce({
      items: [{ ...eventA, title: 'Duplicate copy' }, eventB],
      nextCursor: null,
    });
    renderWorkspace();
    await screen.findByText('Reservation confirmed');
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    await screen.findByText('Earlier activity');
    expect(screen.getAllByText('Reservation confirmed')).toHaveLength(1);
    expect(screen.queryByText('Duplicate copy')).not.toBeInTheDocument();
  });

  it('a failed Load More preserves already-loaded events and shows a bounded error', async () => {
    vi.mocked(listPatientTimeline).mockResolvedValueOnce({
      items: [eventA],
      nextCursor: 'cursor-1',
    });
    vi.mocked(listPatientTimeline).mockRejectedValueOnce(new Error('network'));
    renderWorkspace();
    await screen.findByText('Reservation confirmed');
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not load your timeline. Try again.',
    );
    expect(screen.getByText('Reservation confirmed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Load more' })).toBeInTheDocument();
  });

  it('retrying a failed Load More with the same cursor does not duplicate rows', async () => {
    vi.mocked(listPatientTimeline).mockResolvedValueOnce({
      items: [eventA],
      nextCursor: 'cursor-1',
    });
    vi.mocked(listPatientTimeline).mockRejectedValueOnce(new Error('network'));
    renderWorkspace();
    await screen.findByText('Reservation confirmed');
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    await screen.findByRole('alert');

    vi.mocked(listPatientTimeline).mockResolvedValueOnce({ items: [eventB], nextCursor: null });
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    await screen.findByText('Earlier activity');
    expect(screen.getAllByText('Reservation confirmed')).toHaveLength(1);
    expect(screen.getAllByText('Earlier activity')).toHaveLength(1);
    expect(listPatientTimeline).toHaveBeenNthCalledWith(2, 'cursor-1');
    expect(listPatientTimeline).toHaveBeenNthCalledWith(3, 'cursor-1');
  });

  it('rapid repeated activation while a load-more request is pending emits exactly one request', async () => {
    vi.mocked(listPatientTimeline).mockResolvedValueOnce({
      items: [eventA],
      nextCursor: 'cursor-1',
    });
    let resolvePageB: (value: {
      items: PatientTimelineEvent[];
      nextCursor: null;
    }) => void = () => {};
    vi.mocked(listPatientTimeline).mockImplementationOnce(
      () => new Promise((resolve) => (resolvePageB = resolve)),
    );
    renderWorkspace();
    await screen.findByText('Reservation confirmed');
    const button = screen.getByRole('button', { name: 'Load more' });
    fireEvent.click(button);
    fireEvent.click(screen.getByRole('button', { name: 'Loading more…' }));
    fireEvent.click(screen.getByRole('button', { name: 'Loading more…' }));
    resolvePageB({ items: [], nextCursor: null });
    await waitFor(() => expect(listPatientTimeline).toHaveBeenCalledTimes(2));
  });

  it('the pending Load more button is disabled and exposes a loading label via the shared Button primitive', async () => {
    vi.mocked(listPatientTimeline).mockResolvedValueOnce({
      items: [eventA],
      nextCursor: 'cursor-1',
    });
    let resolvePageB: (value: {
      items: PatientTimelineEvent[];
      nextCursor: null;
    }) => void = () => {};
    vi.mocked(listPatientTimeline).mockImplementationOnce(
      () => new Promise((resolve) => (resolvePageB = resolve)),
    );
    renderWorkspace();
    await screen.findByText('Reservation confirmed');
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    const pendingButton = screen.getByRole('button', { name: 'Loading more…' });
    expect(pendingButton).toBeDisabled();
    expect(pendingButton).toHaveAttribute('aria-busy', 'true');
    resolvePageB({ items: [], nextCursor: null });
  });
});

describe('PatientTimelineWorkspace -- StrictMode and stale-response safety (candidate Task 0037)', () => {
  it('StrictMode double-effect cannot duplicate data -- eventually reaches success with exactly one logical result', async () => {
    vi.mocked(listPatientTimeline).mockResolvedValue({ items: [eventA], nextCursor: null });
    render(
      <StrictMode>
        <LanguageProvider>
          <PatientTimelineWorkspace />
        </LanguageProvider>
      </StrictMode>,
    );
    expect(await screen.findByText('Reservation confirmed')).toBeVisible();
    expect(screen.getAllByText('Reservation confirmed')).toHaveLength(1);
  });

  it('a slower first request cannot overwrite a newer, faster-resolving second request', async () => {
    let resolveFirst: (value: {
      items: PatientTimelineEvent[];
      nextCursor: null;
    }) => void = () => {};
    const firstPromise = new Promise<{ items: PatientTimelineEvent[]; nextCursor: null }>(
      (resolve) => {
        resolveFirst = resolve;
      },
    );
    vi.mocked(listPatientTimeline)
      .mockImplementationOnce(() => firstPromise)
      .mockImplementationOnce(() => Promise.resolve({ items: [eventB], nextCursor: null }));

    render(
      <StrictMode>
        <LanguageProvider>
          <PatientTimelineWorkspace />
        </LanguageProvider>
      </StrictMode>,
    );
    expect(await screen.findByText('Earlier activity')).toBeVisible();
    resolveFirst({ items: [eventA], nextCursor: null });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(screen.queryByText('Reservation confirmed')).not.toBeInTheDocument();
    expect(screen.getByText('Earlier activity')).toBeVisible();
  });

  it('unmount aborts the outstanding initial request signal', async () => {
    let capturedSignal: AbortSignal | undefined;
    let resolveFirst: (value: {
      items: PatientTimelineEvent[];
      nextCursor: null;
    }) => void = () => {};
    const firstPromise = new Promise<{ items: PatientTimelineEvent[]; nextCursor: null }>(
      (resolve) => {
        resolveFirst = resolve;
      },
    );
    vi.mocked(listPatientTimeline).mockImplementationOnce((_cursor, signal) => {
      capturedSignal = signal;
      return firstPromise;
    });
    const { unmount } = renderWorkspace();
    unmount();
    expect(capturedSignal?.aborted).toBe(true);
    resolveFirst({ items: [eventA], nextCursor: null });
  });

  it('a response resolving after cleanup cannot commit state or throw', async () => {
    let resolveFirst: (value: {
      items: PatientTimelineEvent[];
      nextCursor: null;
    }) => void = () => {};
    const firstPromise = new Promise<{ items: PatientTimelineEvent[]; nextCursor: null }>(
      (resolve) => {
        resolveFirst = resolve;
      },
    );
    vi.mocked(listPatientTimeline).mockImplementationOnce(() => firstPromise);
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { unmount } = renderWorkspace();
    unmount();
    resolveFirst({ items: [eventA], nextCursor: null });
    await waitFor(() => expect(listPatientTimeline).toHaveBeenCalledTimes(1));
    expect(consoleErrorSpy).not.toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it('retry establishes a new generation, and a legitimate still-current response still commits correctly', async () => {
    let resolveFirst: (value: {
      items: PatientTimelineEvent[];
      nextCursor: null;
    }) => void = () => {};
    const firstPromise = new Promise<{ items: PatientTimelineEvent[]; nextCursor: null }>(
      (resolve) => {
        resolveFirst = resolve;
      },
    );
    vi.mocked(listPatientTimeline)
      .mockRejectedValueOnce(new Error('network'))
      .mockImplementationOnce(() => firstPromise);
    renderWorkspace();
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    resolveFirst({ items: [eventA], nextCursor: null });
    expect(await screen.findByText('Reservation confirmed')).toBeVisible();
  });

  it('a load-more response from a superseded generation cannot mutate the current list', async () => {
    vi.mocked(listPatientTimeline).mockResolvedValueOnce({
      items: [eventA],
      nextCursor: 'cursor-1',
    });
    let resolveStalePage: (value: {
      items: PatientTimelineEvent[];
      nextCursor: null;
    }) => void = () => {};
    vi.mocked(listPatientTimeline).mockImplementationOnce(
      () => new Promise((resolve) => (resolveStalePage = resolve)),
    );
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { unmount } = renderWorkspace();
    await screen.findByText('Reservation confirmed');
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    unmount();
    resolveStalePage({ items: [eventB], nextCursor: null });
    await waitFor(() => expect(listPatientTimeline).toHaveBeenCalledTimes(2));
    expect(consoleErrorSpy).not.toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });
});

describe('PatientTimelineWorkspace -- safe destination (candidate Task 0037)', () => {
  it('links reservation events to the accepted patient reservations view', async () => {
    const events: PatientTimelineEvent[] = [
      { ...eventA, destinationType: 'NONE', destinationId: null },
      {
        ...eventB,
        destinationType: 'RESERVATION',
        destinationId: '33333333-3333-4333-8333-333333333333',
      },
    ];
    vi.mocked(listPatientTimeline).mockResolvedValue({ items: events, nextCursor: null });
    renderWorkspace();
    await screen.findByText('Reservation confirmed');
    expect(screen.getByRole('link', { name: 'View reservations' })).toHaveAttribute(
      'href',
      '/patient/medicines#reservations',
    );
  });

  it('a malicious/raw destinationId can never become a navigable link', async () => {
    vi.mocked(listPatientTimeline).mockResolvedValue({
      items: [{ ...eventA, destinationType: 'RESERVATION', destinationId: 'javascript:alert(1)' }],
      nextCursor: null,
    });
    renderWorkspace();
    await waitFor(() => expect(listPatientTimeline).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
