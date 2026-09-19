import { StrictMode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '@/components/language-provider';
import {
  listPatientNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/lib/api-client';
import type { PatientNotification } from '@/lib/patient-notification-contract';
import { ActivityCenterWorkspace } from './activity-center-workspace';

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return {
    ...actual,
    listPatientNotifications: vi.fn(),
    markNotificationRead: vi.fn(),
    markAllNotificationsRead: vi.fn(),
  };
});

vi.mock('@/lib/browser-permissions', async () => {
  const actual = await vi.importActual<typeof import('@/lib/browser-permissions')>(
    '@/lib/browser-permissions',
  );
  return {
    ...actual,
    readBrowserCapability: vi.fn().mockResolvedValue('unsupported'),
    requestBrowserNotifications: vi.fn(),
  };
});

const accountNotification: PatientNotification = {
  id: '11111111-1111-4111-8111-111111111111',
  category: 'ACCOUNT',
  title: 'Welcome to AIM',
  message: 'Your account is ready.',
  destinationType: 'NONE',
  destinationId: null,
  readAt: null,
  createdAt: new Date('2027-01-01T10:00:00.000Z').toISOString(),
};

const readNotification: PatientNotification = {
  ...accountNotification,
  id: '22222222-2222-4222-8222-222222222222',
  title: 'Older item',
  readAt: new Date('2027-01-01T09:00:00.000Z').toISOString(),
};

beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  cleanup();
  // Tests that render with an explicit initialLocale (e.g. Tamil) can
  // cause LanguageProvider to persist that choice to localStorage/a
  // cookie as a side effect -- without clearing these, that choice
  // leaks into a LATER test's default (no-initialLocale) render,
  // silently changing what language it renders in.
  window.localStorage.clear();
  document.cookie.split(';').forEach((cookie) => {
    const name = cookie.split('=')[0]?.trim();
    if (name) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  });
});

function renderWorkspace() {
  return render(
    <LanguageProvider>
      <ActivityCenterWorkspace />
    </LanguageProvider>,
  );
}

describe('ActivityCenterWorkspace -- Slice A: initial load experience (candidate Task 0036)', () => {
  it('shows a localized loading state before the list resolves', async () => {
    vi.mocked(listPatientNotifications).mockImplementation(() => new Promise(() => {}));
    renderWorkspace();
    expect(await screen.findAllByRole('status')).not.toHaveLength(0);
  });

  it('renders a semantic page heading', async () => {
    vi.mocked(listPatientNotifications).mockResolvedValue({
      items: [],
      nextCursor: null,
      unreadCount: 0,
    });
    renderWorkspace();
    expect(await screen.findByRole('heading', { name: 'Activity' })).toBeVisible();
  });

  it('renders notifications newest-first, preserving server order exactly', async () => {
    vi.mocked(listPatientNotifications).mockResolvedValue({
      items: [accountNotification, readNotification],
      nextCursor: null,
      unreadCount: 1,
    });
    renderWorkspace();
    const titles = (await screen.findAllByText(/Welcome to AIM|Older item/)).map(
      (el) => el.textContent,
    );
    expect(titles).toEqual(['Welcome to AIM', 'Older item']);
  });

  it('never displays internal metadata fields', async () => {
    vi.mocked(listPatientNotifications).mockResolvedValue({
      items: [accountNotification],
      nextCursor: null,
      unreadCount: 1,
    });
    renderWorkspace();
    await screen.findByText('Welcome to AIM');
    expect(screen.queryByText(/recipientUserId/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/sourceType/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/sourceEventId/i)).not.toBeInTheDocument();
    expect(screen.queryByText(accountNotification.id)).not.toBeInTheDocument();
  });

  it('shows an empty state with zero notifications -- no fabricated content', async () => {
    vi.mocked(listPatientNotifications).mockResolvedValue({
      items: [],
      nextCursor: null,
      unreadCount: 0,
    });
    renderWorkspace();
    expect(await screen.findByText('Nothing here yet')).toBeVisible();
  });

  it('shows a bounded failure state with a retry action on load error', async () => {
    vi.mocked(listPatientNotifications).mockRejectedValue(new Error('network'));
    renderWorkspace();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Could not load your activity. Try again.');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeVisible();
  });

  it('retry re-issues the load and can recover to success', async () => {
    vi.mocked(listPatientNotifications)
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({ items: [accountNotification], nextCursor: null, unreadCount: 1 });
    renderWorkspace();
    await screen.findByRole('alert');
    screen.getByRole('button', { name: 'Retry' }).click();
    expect(await screen.findByText('Welcome to AIM')).toBeVisible();
    expect(listPatientNotifications).toHaveBeenCalledTimes(2);
  });

  it('renders a VISIBLE unread/read status badge -- not merely an sr-only DOM node -- for both states', async () => {
    vi.mocked(listPatientNotifications).mockResolvedValue({
      items: [accountNotification, readNotification],
      nextCursor: null,
      unreadCount: 1,
    });
    renderWorkspace();
    await screen.findByText('Welcome to AIM');
    // Note: jsdom does not load/compute this project's actual Tailwind
    // stylesheet during component tests, so jest-dom's toBeVisible()
    // cannot detect the clip/absolute-position technique the "sr-only"
    // utility class relies on (verified directly: toBeVisible()
    // returns true even for an element explicitly given className
    // "sr-only" in this exact test environment). The only reliable,
    // environment-independent way to prove "not merely an
    // accessibility-only node" here is to assert the rendered element
    // is not marked with that utility class -- checked directly rather
    // than left as an unverifiable assumption.
    const unreadBadge = screen.getByText('Unread');
    const readBadge = screen.getByText('Read');
    expect(unreadBadge.className).not.toContain('sr-only');
    expect(readBadge.className).not.toContain('sr-only');
    expect(unreadBadge).toBeVisible();
    expect(readBadge).toBeVisible();
  });

  it('renders the authoritative server unreadCount, not a locally-derived count', async () => {
    vi.mocked(listPatientNotifications).mockResolvedValue({
      items: [accountNotification, readNotification],
      // Server says 5 unread overall even though only 1 unread item is
      // present on this page -- the UI must trust the server value.
      nextCursor: null,
      unreadCount: 5,
    });
    renderWorkspace();
    expect(await screen.findByText('5 unread')).toBeVisible();
  });

  it('unmount aborts the in-flight request signal AND relinquishes generation ownership, so a resolution that slips through after unmount cannot commit or throw', async () => {
    let capturedSignal: AbortSignal | undefined;
    let resolveFirst: (value: {
      items: PatientNotification[];
      nextCursor: null;
      unreadCount: number;
    }) => void = () => {};
    const firstPromise = new Promise<{
      items: PatientNotification[];
      nextCursor: null;
      unreadCount: number;
    }>((resolve) => {
      resolveFirst = resolve;
    });
    vi.mocked(listPatientNotifications).mockImplementationOnce((_cursor, _unreadOnly, signal) => {
      capturedSignal = signal;
      return firstPromise;
    });
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { unmount } = renderWorkspace();
    unmount();

    // Cleanup must have actually aborted the transport-level signal --
    // not merely incremented an internal counter.
    expect(capturedSignal?.aborted).toBe(true);

    // Simulate an uncooperative fetch/mock that still resolves
    // "successfully" despite the abort signal -- ownership invalidation
    // (not just the abort signal) is what must prevent this from
    // committing state or crashing.
    resolveFirst({ items: [accountNotification], nextCursor: null, unreadCount: 1 });
    await waitFor(() => expect(listPatientNotifications).toHaveBeenCalledTimes(1));
    expect(consoleErrorSpy).not.toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it('true supersession under StrictMode: a slower first-effect response cannot overwrite the second, newer response', async () => {
    // React StrictMode double-invokes effects synchronously
    // (mount -> effect -> cleanup -> effect again) in development.
    // The first invocation's request is deliberately made to resolve
    // AFTER the second invocation's request, to prove that arrival
    // order does not determine which response wins -- only generation
    // ownership does.
    let resolveFirst: (value: {
      items: PatientNotification[];
      nextCursor: null;
      unreadCount: number;
    }) => void = () => {};
    const firstPromise = new Promise<{
      items: PatientNotification[];
      nextCursor: null;
      unreadCount: number;
    }>((resolve) => {
      resolveFirst = resolve;
    });
    vi.mocked(listPatientNotifications)
      .mockImplementationOnce(() => firstPromise)
      .mockImplementationOnce(() =>
        Promise.resolve({ items: [readNotification], nextCursor: null, unreadCount: 0 }),
      );

    render(
      <StrictMode>
        <LanguageProvider>
          <ActivityCenterWorkspace />
        </LanguageProvider>
      </StrictMode>,
    );

    // The second (surviving) invocation's response resolves first and
    // must win.
    expect(await screen.findByText('Older item')).toBeVisible();

    // Now the stale first response finally resolves -- it must NOT
    // retroactively replace the already-committed, correct state.
    resolveFirst({ items: [accountNotification], nextCursor: null, unreadCount: 1 });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(screen.queryByText('Welcome to AIM')).not.toBeInTheDocument();
    expect(screen.getByText('Older item')).toBeVisible();
  });

  it('StrictMode: Activity Center eventually reaches success and is never left permanently loading', async () => {
    vi.mocked(listPatientNotifications).mockResolvedValue({
      items: [accountNotification],
      nextCursor: null,
      unreadCount: 1,
    });
    render(
      <StrictMode>
        <LanguageProvider>
          <ActivityCenterWorkspace />
        </LanguageProvider>
      </StrictMode>,
    );
    expect(await screen.findByText('Welcome to AIM')).toBeVisible();
  });

  it('a normal (non-StrictMode) mount issues exactly one active initial request', async () => {
    vi.mocked(listPatientNotifications).mockResolvedValue({
      items: [],
      nextCursor: null,
      unreadCount: 0,
    });
    renderWorkspace();
    await screen.findByText('Nothing here yet');
    expect(listPatientNotifications).toHaveBeenCalledTimes(1);
  });

  it('localization: Tamil and Urdu render the Activity Center title distinctly from English', async () => {
    const { translate } = await import('@/lib/i18n');
    const english = translate('en', 'activityCenter.title');
    const tamil = translate('ta', 'activityCenter.title');
    const urdu = translate('ur', 'activityCenter.title');
    expect(tamil).not.toBe(english);
    expect(urdu).not.toBe(english);
  });

  it('accessibility: the notification list is a semantic list structure', async () => {
    vi.mocked(listPatientNotifications).mockResolvedValue({
      items: [accountNotification],
      nextCursor: null,
      unreadCount: 1,
    });
    renderWorkspace();
    await screen.findByText('Welcome to AIM');
    expect(screen.getByRole('list')).toBeInTheDocument();
  });
});

describe('ActivityCenterWorkspace -- Slice B: mark-one-read (candidate Task 0036)', () => {
  it('mark-one success: submits exactly one mutation for the clicked notification', async () => {
    vi.mocked(listPatientNotifications).mockResolvedValue({
      items: [accountNotification],
      nextCursor: null,
      unreadCount: 1,
    });
    vi.mocked(markNotificationRead).mockResolvedValue({
      ...accountNotification,
      readAt: new Date('2027-01-02T00:00:00.000Z').toISOString(),
    });
    renderWorkspace();
    fireEvent.click(await screen.findByRole('button', { name: 'Mark read' }));
    await waitFor(() => expect(markNotificationRead).toHaveBeenCalledTimes(1));
    expect(markNotificationRead).toHaveBeenCalledWith(accountNotification.id);
  });

  it('the server-returned notification is authoritative -- the UI renders exactly what the server sent back, not a locally-constructed guess', async () => {
    vi.mocked(listPatientNotifications).mockResolvedValue({
      items: [accountNotification],
      nextCursor: null,
      unreadCount: 1,
    });
    // Deliberately different from what a naive "just set readAt = now"
    // optimistic implementation would produce -- a different title,
    // to prove the row actually re-renders from the server object.
    const serverReturned: PatientNotification = {
      ...accountNotification,
      title: 'Server-updated title',
      readAt: new Date('2099-01-01T00:00:00.000Z').toISOString(),
    };
    vi.mocked(markNotificationRead).mockResolvedValue(serverReturned);
    renderWorkspace();
    fireEvent.click(await screen.findByRole('button', { name: 'Mark read' }));
    expect(await screen.findByText('Server-updated title')).toBeVisible();
  });

  it('does not optimistically change read state before the server responds', async () => {
    vi.mocked(listPatientNotifications).mockResolvedValue({
      items: [accountNotification],
      nextCursor: null,
      unreadCount: 1,
    });
    let resolveMutation: (value: PatientNotification) => void = () => {};
    vi.mocked(markNotificationRead).mockImplementation(
      () => new Promise((resolve) => (resolveMutation = resolve)),
    );
    renderWorkspace();
    fireEvent.click(await screen.findByRole('button', { name: 'Mark read' }));
    // Before the promise resolves, the row must still show Unread and
    // the Mark-read button must still exist (not yet removed).
    expect(screen.getByText('Unread')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Marking read…' })).toBeInTheDocument();
    resolveMutation({ ...accountNotification, readAt: new Date().toISOString() });
    await waitFor(() => expect(screen.queryByText('Unread')).not.toBeInTheDocument());
  });

  it('mark-one failure preserves the previous row state and shows a bounded localized error', async () => {
    vi.mocked(listPatientNotifications).mockResolvedValue({
      items: [accountNotification],
      nextCursor: null,
      unreadCount: 1,
    });
    vi.mocked(markNotificationRead).mockRejectedValue(new Error('network'));
    renderWorkspace();
    fireEvent.click(await screen.findByRole('button', { name: 'Mark read' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not mark this notification read. Try again.',
    );
    // The row remains unread -- failure never silently marks it read.
    expect(screen.getByText('Unread')).toBeInTheDocument();
  });

  it('B1 regression: a stale mark-one failure error is cleared once a retry on the same notification succeeds', async () => {
    vi.mocked(listPatientNotifications).mockResolvedValue({
      items: [accountNotification],
      nextCursor: null,
      unreadCount: 1,
    });
    vi.mocked(markNotificationRead).mockRejectedValueOnce(new Error('network'));
    renderWorkspace();

    fireEvent.click(await screen.findByRole('button', { name: 'Mark read' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not mark this notification read. Try again.',
    );

    const serverReturned: PatientNotification = {
      ...accountNotification,
      readAt: new Date('2027-01-05T00:00:00.000Z').toISOString(),
    };
    vi.mocked(markNotificationRead).mockResolvedValueOnce(serverReturned);
    fireEvent.click(screen.getByRole('button', { name: 'Mark read' }));

    // The obsolete failure banner must disappear once the retry begins
    // (not merely once it succeeds) -- and the row/count must reconcile
    // correctly once it does succeed.
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    await waitFor(() => expect(screen.queryByText('Unread')).not.toBeInTheDocument());
    expect(screen.getByText('Read')).toBeInTheDocument();
  });

  it('mark-one failure preserves the authoritative unread count', async () => {
    vi.mocked(listPatientNotifications).mockResolvedValue({
      items: [accountNotification],
      nextCursor: null,
      unreadCount: 3,
    });
    vi.mocked(markNotificationRead).mockRejectedValue(new Error('network'));
    renderWorkspace();
    fireEvent.click(await screen.findByRole('button', { name: 'Mark read' }));
    await screen.findByRole('alert');
    expect(screen.getByText('3 unread')).toBeVisible();
  });

  it('duplicate mark-one clicks while pending create only one mutation request', async () => {
    vi.mocked(listPatientNotifications).mockResolvedValue({
      items: [accountNotification],
      nextCursor: null,
      unreadCount: 1,
    });
    let resolveMutation: (value: PatientNotification) => void = () => {};
    vi.mocked(markNotificationRead).mockImplementation(
      () => new Promise((resolve) => (resolveMutation = resolve)),
    );
    renderWorkspace();
    const button = await screen.findByRole('button', { name: 'Mark read' });
    fireEvent.click(button);
    // The button is now disabled/relabeled -- but even a defensive
    // duplicate dispatch to the handler must not create a second call.
    fireEvent.click(screen.getByRole('button', { name: 'Marking read…' }));
    fireEvent.click(screen.getByRole('button', { name: 'Marking read…' }));
    resolveMutation({ ...accountNotification, readAt: new Date().toISOString() });
    await waitFor(() => expect(markNotificationRead).toHaveBeenCalledTimes(1));
  });

  it('per-row pending isolation: marking notification A pending does not disable or affect notification B', async () => {
    vi.mocked(listPatientNotifications).mockResolvedValue({
      items: [accountNotification, { ...readNotification, readAt: null, title: 'Second unread' }],
      nextCursor: null,
      unreadCount: 2,
    });
    let resolveMutation: (value: PatientNotification) => void = () => {};
    vi.mocked(markNotificationRead).mockImplementation(
      () => new Promise((resolve) => (resolveMutation = resolve)),
    );
    renderWorkspace();
    const buttons = await screen.findAllByRole('button', { name: 'Mark read' });
    expect(buttons).toHaveLength(2);
    fireEvent.click(buttons[0]);
    // The second row's button must remain fully enabled and unaffected.
    const remainingButtons = screen.getAllByRole('button', { name: 'Mark read' });
    expect(remainingButtons).toHaveLength(1);
    expect(remainingButtons[0]).not.toBeDisabled();
    resolveMutation({ ...accountNotification, readAt: new Date().toISOString() });
    await waitFor(() => expect(markNotificationRead).toHaveBeenCalledTimes(1));
  });

  it('accessibility: the pending mark-read button exposes aria-busy and disabled', async () => {
    vi.mocked(listPatientNotifications).mockResolvedValue({
      items: [accountNotification],
      nextCursor: null,
      unreadCount: 1,
    });
    let resolveMutation: (value: PatientNotification) => void = () => {};
    vi.mocked(markNotificationRead).mockImplementation(
      () => new Promise((resolve) => (resolveMutation = resolve)),
    );
    renderWorkspace();
    fireEvent.click(await screen.findByRole('button', { name: 'Mark read' }));
    const pendingButton = screen.getByRole('button', { name: 'Marking read…' });
    expect(pendingButton).toBeDisabled();
    expect(pendingButton).toHaveAttribute('aria-busy', 'true');
    resolveMutation({ ...accountNotification, readAt: new Date().toISOString() });
  });

  it('Tamil (rendered): mark-one shows the actual localized pending label and error text, not just distinct catalogue entries', async () => {
    const { translate } = await import('@/lib/i18n');
    vi.mocked(listPatientNotifications).mockResolvedValue({
      items: [accountNotification],
      nextCursor: null,
      unreadCount: 1,
    });
    let rejectMutation: (error: Error) => void = () => {};
    vi.mocked(markNotificationRead).mockImplementation(
      () => new Promise((_resolve, reject) => (rejectMutation = reject)),
    );
    render(
      <LanguageProvider initialLocale="ta">
        <ActivityCenterWorkspace />
      </LanguageProvider>,
    );

    const markReadLabel = translate('ta', 'activityCenter.markRead');
    const pendingLabel = translate('ta', 'activityCenter.markingRead');
    const errorLabel = translate('ta', 'activityCenter.markReadError');

    fireEvent.click(await screen.findByRole('button', { name: markReadLabel }));
    expect(screen.getByRole('button', { name: pendingLabel })).toBeInTheDocument();

    rejectMutation(new Error('network'));
    expect(await screen.findByRole('alert')).toHaveTextContent(errorLabel);
  });

  it('localization: Tamil renders mark-read mutation state distinctly from English', async () => {
    const { translate } = await import('@/lib/i18n');
    expect(translate('ta', 'activityCenter.markRead')).not.toBe(
      translate('en', 'activityCenter.markRead'),
    );
    expect(translate('ta', 'activityCenter.markingRead')).not.toBe(
      translate('en', 'activityCenter.markingRead'),
    );
    expect(translate('ta', 'activityCenter.markReadError')).not.toBe(
      translate('en', 'activityCenter.markReadError'),
    );
  });
});

describe('ActivityCenterWorkspace -- Slice B: mark-all-read (candidate Task 0036)', () => {
  it('mark-all button is disabled when authoritative unreadCount is zero', async () => {
    vi.mocked(listPatientNotifications).mockResolvedValue({
      items: [readNotification],
      nextCursor: null,
      unreadCount: 0,
    });
    renderWorkspace();
    expect(await screen.findByRole('button', { name: 'Mark all read' })).toBeDisabled();
  });

  it('mark-all success: submits exactly one mutation', async () => {
    vi.mocked(listPatientNotifications).mockResolvedValue({
      items: [accountNotification],
      nextCursor: null,
      unreadCount: 1,
    });
    vi.mocked(markAllNotificationsRead).mockResolvedValue({ updatedCount: 1 });
    renderWorkspace();
    fireEvent.click(await screen.findByRole('button', { name: 'Mark all read' }));
    await waitFor(() => expect(markAllNotificationsRead).toHaveBeenCalledTimes(1));
  });

  it('mark-all success clears the authoritative unread count to zero, even when updatedCount exceeds visible rows', async () => {
    vi.mocked(listPatientNotifications).mockResolvedValue({
      items: [accountNotification],
      // Server reports 5 total unread across the whole inbox, but only
      // 1 row is loaded on this page.
      nextCursor: null,
      unreadCount: 5,
    });
    // updatedCount reflects the wider server-side operation -- the UI
    // must not try to reconcile this number against visible rows.
    vi.mocked(markAllNotificationsRead).mockResolvedValue({ updatedCount: 5 });
    renderWorkspace();
    await screen.findByText('5 unread');
    fireEvent.click(screen.getByRole('button', { name: 'Mark all read' }));
    await waitFor(() => expect(screen.queryByText(/unread$/)).not.toBeInTheDocument());
  });

  it('mark-all success marks the visible unread row(s) as read', async () => {
    vi.mocked(listPatientNotifications).mockResolvedValue({
      items: [accountNotification],
      nextCursor: null,
      unreadCount: 1,
    });
    vi.mocked(markAllNotificationsRead).mockResolvedValue({ updatedCount: 1 });
    renderWorkspace();
    fireEvent.click(await screen.findByRole('button', { name: 'Mark all read' }));
    await waitFor(() => expect(screen.queryByText('Unread')).not.toBeInTheDocument());
    expect(screen.getByText('Read')).toBeInTheDocument();
  });

  it('does not optimistically clear unread state before the server responds', async () => {
    vi.mocked(listPatientNotifications).mockResolvedValue({
      items: [accountNotification],
      nextCursor: null,
      unreadCount: 1,
    });
    let resolveMutation: (value: { updatedCount: number }) => void = () => {};
    vi.mocked(markAllNotificationsRead).mockImplementation(
      () => new Promise((resolve) => (resolveMutation = resolve)),
    );
    renderWorkspace();
    fireEvent.click(await screen.findByRole('button', { name: 'Mark all read' }));
    expect(screen.getByText('Unread')).toBeInTheDocument();
    expect(screen.getByText('1 unread')).toBeVisible();
    resolveMutation({ updatedCount: 1 });
    await waitFor(() => expect(screen.queryByText('Unread')).not.toBeInTheDocument());
  });

  it('mark-all failure preserves all previously displayed read/unread states', async () => {
    vi.mocked(listPatientNotifications).mockResolvedValue({
      items: [accountNotification, readNotification],
      nextCursor: null,
      unreadCount: 1,
    });
    vi.mocked(markAllNotificationsRead).mockRejectedValue(new Error('network'));
    renderWorkspace();
    fireEvent.click(await screen.findByRole('button', { name: 'Mark all read' }));
    await screen.findByRole('alert');
    expect(screen.getByText('Unread')).toBeInTheDocument();
    expect(screen.getByText('Read')).toBeInTheDocument();
  });

  it('mark-all failure preserves the previous unread count and shows a bounded localized error', async () => {
    vi.mocked(listPatientNotifications).mockResolvedValue({
      items: [accountNotification],
      nextCursor: null,
      unreadCount: 4,
    });
    vi.mocked(markAllNotificationsRead).mockRejectedValue(new Error('network'));
    renderWorkspace();
    fireEvent.click(await screen.findByRole('button', { name: 'Mark all read' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not mark all notifications read. Try again.',
    );
    expect(screen.getByText('4 unread')).toBeVisible();
  });

  it('duplicate mark-all clicks while pending create only one mutation request', async () => {
    vi.mocked(listPatientNotifications).mockResolvedValue({
      items: [accountNotification],
      nextCursor: null,
      unreadCount: 1,
    });
    let resolveMutation: (value: { updatedCount: number }) => void = () => {};
    vi.mocked(markAllNotificationsRead).mockImplementation(
      () => new Promise((resolve) => (resolveMutation = resolve)),
    );
    renderWorkspace();
    const button = await screen.findByRole('button', { name: 'Mark all read' });
    fireEvent.click(button);
    fireEvent.click(screen.getByRole('button', { name: 'Marking all read…' }));
    fireEvent.click(screen.getByRole('button', { name: 'Marking all read…' }));
    resolveMutation({ updatedCount: 1 });
    await waitFor(() => expect(markAllNotificationsRead).toHaveBeenCalledTimes(1));
  });

  it('accessibility: the pending mark-all button exposes a loading label, disabled state, and aria-busy="true"', async () => {
    vi.mocked(listPatientNotifications).mockResolvedValue({
      items: [accountNotification],
      nextCursor: null,
      unreadCount: 1,
    });
    let resolveMutation: (value: { updatedCount: number }) => void = () => {};
    vi.mocked(markAllNotificationsRead).mockImplementation(
      () => new Promise((resolve) => (resolveMutation = resolve)),
    );
    renderWorkspace();
    fireEvent.click(await screen.findByRole('button', { name: 'Mark all read' }));
    const pendingButton = screen.getByRole('button', { name: 'Marking all read…' });
    expect(pendingButton).toBeDisabled();
    expect(pendingButton).toHaveAttribute('aria-busy', 'true');
    resolveMutation({ updatedCount: 1 });
  });

  it('a mutation failure renders bounded localized copy, never raw server/JSON text', async () => {
    vi.mocked(listPatientNotifications).mockResolvedValue({
      items: [accountNotification],
      nextCursor: null,
      unreadCount: 1,
    });
    vi.mocked(markAllNotificationsRead).mockRejectedValue(
      new Error('{"internal":"stack trace leak from upstream"}'),
    );
    renderWorkspace();
    fireEvent.click(await screen.findByRole('button', { name: 'Mark all read' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).not.toContain('internal');
    expect(alert.textContent).not.toContain('stack trace');
  });

  it('Tamil (rendered): mark-all shows the actual localized pending label and success announcement, not just distinct catalogue entries', async () => {
    const { translate } = await import('@/lib/i18n');
    vi.mocked(listPatientNotifications).mockResolvedValue({
      items: [accountNotification],
      nextCursor: null,
      unreadCount: 1,
    });
    let resolveMutation: (value: { updatedCount: number }) => void = () => {};
    vi.mocked(markAllNotificationsRead).mockImplementation(
      () => new Promise((resolve) => (resolveMutation = resolve)),
    );
    render(
      <LanguageProvider initialLocale="ta">
        <ActivityCenterWorkspace />
      </LanguageProvider>,
    );

    const markAllLabel = translate('ta', 'activityCenter.markAllRead');
    const pendingLabel = translate('ta', 'activityCenter.markingAllRead');
    const successLabel = translate('ta', 'activityCenter.markAllReadSuccess');

    fireEvent.click(await screen.findByRole('button', { name: markAllLabel }));
    expect(screen.getByRole('button', { name: pendingLabel })).toBeInTheDocument();

    resolveMutation({ updatedCount: 1 });
    expect(await screen.findByText(successLabel)).toBeVisible();
  });

  it('localization: Tamil renders mark-all mutation state distinctly from English', async () => {
    const { translate } = await import('@/lib/i18n');
    expect(translate('ta', 'activityCenter.markAllRead')).not.toBe(
      translate('en', 'activityCenter.markAllRead'),
    );
    expect(translate('ta', 'activityCenter.markAllReadError')).not.toBe(
      translate('en', 'activityCenter.markAllReadError'),
    );
  });
});

describe('ActivityCenterWorkspace -- Correction 3: AIM-selected locale drives date/time formatting (candidate Task 0036)', () => {
  function renderWithLocale(locale: 'en' | 'ta' | 'ur') {
    return render(
      <LanguageProvider initialLocale={locale}>
        <ActivityCenterWorkspace />
      </LanguageProvider>,
    );
  }

  it('renders the actual localized heading/copy for en/ta/ur, not merely via an independent translate() call', async () => {
    vi.mocked(listPatientNotifications).mockResolvedValue({
      items: [],
      nextCursor: null,
      unreadCount: 0,
    });

    const { unmount: unmountEn } = renderWithLocale('en');
    const englishHeading = (await screen.findByRole('heading')).textContent;
    unmountEn();
    cleanup();

    vi.mocked(listPatientNotifications).mockResolvedValue({
      items: [],
      nextCursor: null,
      unreadCount: 0,
    });
    const { unmount: unmountTa } = renderWithLocale('ta');
    const tamilHeading = (await screen.findByRole('heading')).textContent;
    unmountTa();
    cleanup();

    vi.mocked(listPatientNotifications).mockResolvedValue({
      items: [],
      nextCursor: null,
      unreadCount: 0,
    });
    renderWithLocale('ur');
    const urduHeading = (await screen.findByRole('heading')).textContent;

    expect(tamilHeading).not.toBe(englishHeading);
    expect(urduHeading).not.toBe(englishHeading);
  });

  it('renders the actual localized unread/read badge text under Tamil, not the English default', async () => {
    vi.mocked(listPatientNotifications).mockResolvedValue({
      items: [accountNotification],
      nextCursor: null,
      unreadCount: 1,
    });
    renderWithLocale('ta');
    await screen.findByText('Welcome to AIM');
    const { translate } = await import('@/lib/i18n');
    expect(screen.getByText(translate('ta', 'activityCenter.unreadLabel'))).toBeInTheDocument();
    expect(screen.queryByText('Unread')).not.toBeInTheDocument();
  });

  it('date/time formatting receives the AIM-selected locale, proven by spying on the formatter rather than asserting a brittle ICU string', async () => {
    const dateTimeFormatSpy = vi.spyOn(Intl, 'DateTimeFormat');
    vi.mocked(listPatientNotifications).mockResolvedValue({
      items: [accountNotification],
      nextCursor: null,
      unreadCount: 1,
    });
    renderWithLocale('ta');
    await screen.findByText('Welcome to AIM');

    const calledWithTamil = dateTimeFormatSpy.mock.calls.some((call) => call[0] === 'ta');
    expect(calledWithTamil).toBe(true);
    dateTimeFormatSpy.mockRestore();
  });

  it('preserves the machine-readable ISO timestamp in the <time dateTime> attribute regardless of locale', async () => {
    vi.mocked(listPatientNotifications).mockResolvedValue({
      items: [accountNotification],
      nextCursor: null,
      unreadCount: 1,
    });
    renderWithLocale('ur');
    await screen.findByText('Welcome to AIM');
    const timeElement = document.querySelector('time');
    expect(timeElement?.getAttribute('datetime')).toBe(accountNotification.createdAt);
  });

  it('Urdu rendering runs under the existing RTL document-language system without a hard-coded LTR override in this component', async () => {
    vi.mocked(listPatientNotifications).mockResolvedValue({
      items: [],
      nextCursor: null,
      unreadCount: 0,
    });
    const { translate } = await import('@/lib/i18n');
    renderWithLocale('ur');
    await screen.findByText(translate('ur', 'activityCenter.emptyTitle'));
    // This component itself must not set an inline dir="ltr" anywhere
    // that would fight the app-wide RTL system LanguageProvider
    // already manages for Urdu.
    const main = document.querySelector('main');
    expect(main?.getAttribute('dir')).not.toBe('ltr');
  });
});

describe('ActivityCenterWorkspace -- Slice C: cursor pagination (candidate Task 0036)', () => {
  const pageA: PatientNotification[] = [
    accountNotification,
    { ...readNotification, id: '33333333-3333-4333-8333-333333333333', title: 'Page A second' },
  ];

  it('load-more uses the exact opaque cursor returned by the server, appends page B in server order, and updates nextCursor/unreadCount from the response -- never recalculated locally', async () => {
    vi.mocked(listPatientNotifications).mockResolvedValueOnce({
      items: pageA,
      nextCursor: 'opaque-cursor-abc',
      unreadCount: 9,
    });
    const pageB: PatientNotification[] = [
      { ...accountNotification, id: '44444444-4444-4444-8444-444444444444', title: 'Page B item' },
    ];
    vi.mocked(listPatientNotifications).mockResolvedValueOnce({
      items: pageB,
      nextCursor: 'opaque-cursor-def',
      unreadCount: 3,
    });

    renderWorkspace();
    await screen.findByText('Welcome to AIM');
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));

    await screen.findByText('Page B item');
    expect(listPatientNotifications).toHaveBeenCalledTimes(2);
    expect(listPatientNotifications).toHaveBeenNthCalledWith(2, 'opaque-cursor-abc', undefined);
    // Server order preserved exactly: page A items first, then page B.
    const titles = screen
      .getAllByText(/Welcome to AIM|Page A second|Page B item/)
      .map((el) => el.textContent);
    expect(titles).toEqual(['Welcome to AIM', 'Page A second', 'Page B item']);
    // unreadCount comes from page B's response (3), never locally
    // recalculated from row counts.
    expect(screen.getByText('3 unread')).toBeVisible();
  });

  it('a null nextCursor from the server removes the Load more control entirely', async () => {
    vi.mocked(listPatientNotifications).mockResolvedValue({
      items: pageA,
      nextCursor: null,
      unreadCount: 2,
    });
    renderWorkspace();
    await screen.findByText('Welcome to AIM');
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
    // No hidden automatic follow-up request.
    expect(listPatientNotifications).toHaveBeenCalledTimes(1);
  });

  it('overlap duplicate across pages: an id already rendered from page A is not duplicated when page B repeats it', async () => {
    vi.mocked(listPatientNotifications).mockResolvedValueOnce({
      items: pageA,
      nextCursor: 'cursor-1',
      unreadCount: 2,
    });
    const pageBWithOverlap: PatientNotification[] = [
      { ...pageA[1], title: 'Page A second' }, // same id as pageA[1]
      {
        ...accountNotification,
        id: '55555555-5555-4555-8555-555555555555',
        title: 'Genuinely new',
      },
    ];
    vi.mocked(listPatientNotifications).mockResolvedValueOnce({
      items: pageBWithOverlap,
      nextCursor: null,
      unreadCount: 1,
    });
    renderWorkspace();
    await screen.findByText('Welcome to AIM');
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    await screen.findByText('Genuinely new');

    expect(screen.getAllByText('Page A second')).toHaveLength(1);
  });

  it('C4 regression: duplicate ids repeated WITHIN the same incoming page are rendered exactly once', async () => {
    vi.mocked(listPatientNotifications).mockResolvedValueOnce({
      items: [accountNotification],
      nextCursor: 'cursor-1',
      unreadCount: 1,
    });
    const repeatedId = '66666666-6666-4666-8666-666666666666';
    const pageWithInternalDuplicate: PatientNotification[] = [
      { ...readNotification, id: repeatedId, title: 'Repeated item' },
      { ...readNotification, id: repeatedId, title: 'Repeated item (later copy)' },
      { ...accountNotification, id: '77777777-7777-4777-8777-777777777777', title: 'Third item' },
    ];
    vi.mocked(listPatientNotifications).mockResolvedValueOnce({
      items: pageWithInternalDuplicate,
      nextCursor: null,
      unreadCount: 1,
    });
    renderWorkspace();
    await screen.findByText('Welcome to AIM');
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    await screen.findByText('Third item');

    // Exactly one rendered row for the repeated id, preserving the
    // EARLIEST (first) occurrence's content.
    expect(screen.getAllByText(/Repeated item/)).toHaveLength(1);
    expect(screen.getByText('Repeated item')).toBeInTheDocument();
    expect(screen.queryByText('Repeated item (later copy)')).not.toBeInTheDocument();
  });

  it('C5: rapid repeated activation while a load-more request is pending emits exactly one request', async () => {
    vi.mocked(listPatientNotifications).mockResolvedValueOnce({
      items: [accountNotification],
      nextCursor: 'cursor-1',
      unreadCount: 1,
    });
    let resolvePageB: (value: {
      items: PatientNotification[];
      nextCursor: null;
      unreadCount: number;
    }) => void = () => {};
    vi.mocked(listPatientNotifications).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolvePageB = resolve;
        }),
    );
    renderWorkspace();
    await screen.findByText('Welcome to AIM');
    const button = screen.getByRole('button', { name: 'Load more' });
    fireEvent.click(button);
    // Rapid repeated activation on the (now pending/disabled) control.
    fireEvent.click(screen.getByRole('button', { name: 'Loading more…' }));
    fireEvent.click(screen.getByRole('button', { name: 'Loading more…' }));
    resolvePageB({ items: [], nextCursor: null, unreadCount: 0 });
    await waitFor(() => expect(listPatientNotifications).toHaveBeenCalledTimes(2));
  });

  it('the pending Load more control exposes disabled, a loading label, and aria-busy="true" via the shared Button primitive', async () => {
    vi.mocked(listPatientNotifications).mockResolvedValueOnce({
      items: [accountNotification],
      nextCursor: 'cursor-1',
      unreadCount: 1,
    });
    let resolvePageB: (value: {
      items: PatientNotification[];
      nextCursor: null;
      unreadCount: number;
    }) => void = () => {};
    vi.mocked(listPatientNotifications).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolvePageB = resolve;
        }),
    );
    renderWorkspace();
    await screen.findByText('Welcome to AIM');
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    const pendingButton = screen.getByRole('button', { name: 'Loading more…' });
    expect(pendingButton).toBeDisabled();
    expect(pendingButton).toHaveAttribute('aria-busy', 'true');
    resolvePageB({ items: [], nextCursor: null, unreadCount: 0 });
  });

  it('pagination failure preserves page A, the existing cursor, and the unread count -- and shows a bounded localized error', async () => {
    vi.mocked(listPatientNotifications).mockResolvedValueOnce({
      items: [accountNotification],
      nextCursor: 'cursor-1',
      unreadCount: 5,
    });
    vi.mocked(listPatientNotifications).mockRejectedValueOnce(new Error('network'));
    renderWorkspace();
    await screen.findByText('Welcome to AIM');
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not load your activity. Try again.',
    );
    // Page A remains, unread count unchanged, and Load more (using the
    // same cursor) is still available for retry.
    expect(screen.getByText('Welcome to AIM')).toBeInTheDocument();
    expect(screen.getByText('5 unread')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Load more' })).toBeInTheDocument();
  });

  it('retry after a pagination failure requests the SAME cursor again, and success clears the error and appends exactly once', async () => {
    vi.mocked(listPatientNotifications).mockResolvedValueOnce({
      items: [accountNotification],
      nextCursor: 'retry-cursor',
      unreadCount: 2,
    });
    vi.mocked(listPatientNotifications).mockRejectedValueOnce(new Error('network'));
    renderWorkspace();
    await screen.findByText('Welcome to AIM');
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    await screen.findByRole('alert');

    vi.mocked(listPatientNotifications).mockResolvedValueOnce({
      items: [{ ...readNotification, title: 'Arrived on retry' }],
      nextCursor: null,
      unreadCount: 0,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));

    await screen.findByText('Arrived on retry');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getAllByText('Arrived on retry')).toHaveLength(1);
    expect(listPatientNotifications).toHaveBeenNthCalledWith(2, 'retry-cursor', undefined);
    expect(listPatientNotifications).toHaveBeenNthCalledWith(3, 'retry-cursor', undefined);
  });

  it('a failed pagination request never renders raw server/internal error text', async () => {
    vi.mocked(listPatientNotifications).mockResolvedValueOnce({
      items: [accountNotification],
      nextCursor: 'cursor-1',
      unreadCount: 1,
    });
    vi.mocked(listPatientNotifications).mockRejectedValueOnce(
      new Error('{"internal":"raw upstream failure detail"}'),
    );
    renderWorkspace();
    await screen.findByText('Welcome to AIM');
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).not.toContain('internal');
    expect(alert.textContent).not.toContain('raw upstream');
  });

  it('C7/C8: a stale in-flight load-more response cannot commit or crash after the component has been unmounted/reset -- the same generation ownership handleLoadMore now participates in', async () => {
    vi.mocked(listPatientNotifications).mockResolvedValueOnce({
      items: [accountNotification],
      nextCursor: 'stale-cursor',
      unreadCount: 1,
    });
    let resolveStalePage: (value: {
      items: PatientNotification[];
      nextCursor: string | null;
      unreadCount: number;
    }) => void = () => {};
    vi.mocked(listPatientNotifications).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveStalePage = resolve;
        }),
    );
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { unmount } = renderWorkspace();
    await screen.findByText('Welcome to AIM');
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));

    // Unmount while the load-more request is still pending -- this is
    // the same generation-invalidating cleanup already proven for the
    // initial load; this test proves handleLoadMore's own commits
    // (setItems/setNextCursor/setUnreadCount) are ALSO gated by it,
    // not only the initial-load commits.
    unmount();
    resolveStalePage({
      items: [{ ...readNotification, title: 'Should never render' }],
      nextCursor: null,
      unreadCount: 99,
    });
    await waitFor(() => expect(listPatientNotifications).toHaveBeenCalledTimes(2));
    // No crash/uncaught error from committing state on the unmounted
    // instance, and nothing to render at all since it's unmounted --
    // the absence of a console error is the observable proof that the
    // stale commit was correctly suppressed.
    expect(consoleErrorSpy).not.toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it('server order is never re-sorted client-side, even when page B contains an earlier timestamp/alphabetically-earlier title', async () => {
    vi.mocked(listPatientNotifications).mockResolvedValueOnce({
      items: [
        {
          ...accountNotification,
          title: 'Z last-ish title',
          createdAt: new Date('2027-01-05').toISOString(),
        },
      ],
      nextCursor: 'cursor-1',
      unreadCount: 1,
    });
    vi.mocked(listPatientNotifications).mockResolvedValueOnce({
      items: [
        {
          ...readNotification,
          id: '99999999-9999-4999-8999-999999999999',
          title: 'A earlier-ish title',
          createdAt: new Date('2020-01-01').toISOString(),
        },
      ],
      nextCursor: null,
      unreadCount: 0,
    });
    renderWorkspace();
    await screen.findByText('Z last-ish title');
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    await screen.findByText('A earlier-ish title');

    const titles = screen
      .getAllByText(/Z last-ish title|A earlier-ish title/)
      .map((el) => el.textContent);
    // Server order preserved -- "Z" (page A) stays first even though
    // "A" (page B) would sort earlier both alphabetically and
    // chronologically.
    expect(titles).toEqual(['Z last-ish title', 'A earlier-ish title']);
  });

  it('a previously mark-one-read notification is not reverted to unread if a later page defensively deduplicates the same id', async () => {
    vi.mocked(listPatientNotifications).mockResolvedValueOnce({
      items: [accountNotification],
      nextCursor: 'cursor-1',
      unreadCount: 1,
    });
    vi.mocked(markNotificationRead).mockResolvedValueOnce({
      ...accountNotification,
      readAt: new Date('2027-02-01').toISOString(),
    });
    renderWorkspace();
    await screen.findByText('Welcome to AIM');
    fireEvent.click(screen.getByRole('button', { name: 'Mark read' }));
    await waitFor(() => expect(screen.queryByText('Unread')).not.toBeInTheDocument());

    // A later page redelivers the SAME id, unread (stale server data,
    // or a defensive-dedup scenario) -- the already-rendered,
    // authoritative (now-read) first occurrence must remain.
    vi.mocked(listPatientNotifications).mockResolvedValueOnce({
      items: [{ ...accountNotification, readAt: null }],
      nextCursor: null,
      unreadCount: 0,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    await waitFor(() => expect(listPatientNotifications).toHaveBeenCalledTimes(2));

    expect(screen.getByText('Read')).toBeInTheDocument();
    expect(screen.queryByText('Unread')).not.toBeInTheDocument();
  });

  it('Tamil (rendered): the actual localized "Load more" / "Loading more…" labels are rendered, not just distinct catalogue entries', async () => {
    const { translate } = await import('@/lib/i18n');
    vi.mocked(listPatientNotifications).mockResolvedValueOnce({
      items: [accountNotification],
      nextCursor: 'cursor-1',
      unreadCount: 1,
    });
    let resolvePageB: (value: {
      items: PatientNotification[];
      nextCursor: null;
      unreadCount: number;
    }) => void = () => {};
    vi.mocked(listPatientNotifications).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolvePageB = resolve;
        }),
    );
    render(
      <LanguageProvider initialLocale="ta">
        <ActivityCenterWorkspace />
      </LanguageProvider>,
    );

    const loadMoreLabel = translate('ta', 'activityCenter.loadMore');
    const loadingMoreLabel = translate('ta', 'activityCenter.loadingMore');

    fireEvent.click(await screen.findByRole('button', { name: loadMoreLabel }));
    expect(screen.getByRole('button', { name: loadingMoreLabel })).toBeInTheDocument();
    resolvePageB({ items: [], nextCursor: null, unreadCount: 0 });
  });
});
