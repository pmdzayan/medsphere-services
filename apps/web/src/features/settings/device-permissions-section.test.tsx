import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '@/components/language-provider';
import { getConsentStatus, recordConsent } from '@/lib/api-client';
import {
  readBrowserCapability,
  requestBrowserNotifications,
  type BrowserCapabilityState,
} from '@/lib/browser-permissions';
import { DevicePermissionsSection } from './device-permissions-section';

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return { ...actual, getConsentStatus: vi.fn(), recordConsent: vi.fn() };
});

vi.mock('@/lib/browser-permissions', async () => {
  const actual = await vi.importActual<typeof import('@/lib/browser-permissions')>(
    '@/lib/browser-permissions',
  );
  return { ...actual, readBrowserCapability: vi.fn(), requestBrowserNotifications: vi.fn() };
});

const emptyConsent = [
  { category: 'LOCATION_USE' as const, status: null, updatedAt: null },
  { category: 'NOTIFICATIONS_RESERVATIONS' as const, status: null, updatedAt: null },
  { category: 'NOTIFICATIONS_OPERATIONAL' as const, status: null, updatedAt: null },
];

function stubCapabilities(location: BrowserCapabilityState, notifications: BrowserCapabilityState) {
  vi.mocked(readBrowserCapability).mockImplementation(
    async (kind: 'location' | 'notifications' | 'camera') =>
      kind === 'location' ? location : notifications,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getConsentStatus).mockResolvedValue(emptyConsent);
});

afterEach(() => {
  cleanup();
});

function renderSection() {
  return render(
    <LanguageProvider initialLocale="en">
      <DevicePermissionsSection />
    </LanguageProvider>,
  );
}

describe('DevicePermissionsSection', () => {
  it('shows the browser-reported location permission state, distinct from any app preference', async () => {
    stubCapabilities('denied', 'prompt');

    renderSection();

    expect(await screen.findByText('Blocked in this browser')).toBeVisible();
    expect(screen.getByText(/Location permission is blocked in your browser/i)).toBeVisible();
  });

  it('never shows a fake "enable" button for a permanently denied permission', async () => {
    stubCapabilities('denied', 'denied');

    renderSection();

    const deniedGuidance = await screen.findAllByText(/browser\/site settings/i);
    expect(deniedGuidance.length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByRole('button', { name: 'Enable notifications' })).not.toBeInTheDocument();
  });

  it('shows a contextual enable button only when notification permission has not yet been asked', async () => {
    stubCapabilities('prompt', 'prompt');

    renderSection();

    expect(await screen.findByRole('button', { name: 'Enable notifications' })).toBeVisible();
  });

  it('shows the app-controlled explanation before calling the browser notification API', async () => {
    stubCapabilities('prompt', 'prompt');
    vi.mocked(requestBrowserNotifications).mockResolvedValue('granted');

    renderSection();

    fireEvent.click(await screen.findByRole('button', { name: 'Enable notifications' }));

    expect(await screen.findByText(/Enable browser notifications\?/i)).toBeVisible();
    expect(requestBrowserNotifications).not.toHaveBeenCalled();
  });

  it('only calls the browser notification API after the explanation is continued, and records consent on grant', async () => {
    stubCapabilities('prompt', 'prompt');
    vi.mocked(requestBrowserNotifications).mockResolvedValue('granted');
    vi.mocked(recordConsent).mockResolvedValue({
      category: 'NOTIFICATIONS_RESERVATIONS',
      status: 'GRANTED',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    renderSection();

    fireEvent.click(await screen.findByRole('button', { name: 'Enable notifications' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Continue to browser settings' }));

    await waitFor(() => expect(requestBrowserNotifications).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(recordConsent).toHaveBeenCalledWith({
        category: 'NOTIFICATIONS_RESERVATIONS',
        status: 'GRANTED',
        source: 'settings_privacy_page',
      }),
    );
  });

  it('never calls the browser notification API when the explanation is declined', async () => {
    stubCapabilities('prompt', 'prompt');
    vi.mocked(requestBrowserNotifications).mockResolvedValue('denied');

    renderSection();

    fireEvent.click(await screen.findByRole('button', { name: 'Enable notifications' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Not now' }));

    expect(requestBrowserNotifications).not.toHaveBeenCalled();
    expect(recordConsent).not.toHaveBeenCalled();
  });

  it('allows withdrawing a previously granted location consent', async () => {
    stubCapabilities('granted', 'prompt');
    vi.mocked(getConsentStatus).mockResolvedValue([
      { category: 'LOCATION_USE', status: 'GRANTED', updatedAt: '2026-01-01T00:00:00.000Z' },
      { category: 'NOTIFICATIONS_RESERVATIONS', status: null, updatedAt: null },
      { category: 'NOTIFICATIONS_OPERATIONAL', status: null, updatedAt: null },
    ]);
    vi.mocked(recordConsent).mockResolvedValue({
      category: 'LOCATION_USE',
      status: 'WITHDRAWN',
      updatedAt: '2026-01-02T00:00:00.000Z',
    });

    renderSection();

    const withdrawButton = await screen.findByRole('button', {
      name: 'Withdraw location-use consent',
    });
    fireEvent.click(withdrawButton);

    await waitFor(() =>
      expect(recordConsent).toHaveBeenCalledWith({
        category: 'LOCATION_USE',
        status: 'WITHDRAWN',
        source: 'settings_privacy_page',
      }),
    );
  });
});
