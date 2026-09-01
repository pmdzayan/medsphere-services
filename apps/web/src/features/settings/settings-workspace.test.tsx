import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '@/components/language-provider';
import {
  getConsentStatus,
  getPrivacyPreferences,
  getSupportedLanguages,
  updatePreferredLanguage,
  updatePrivacyPreferences,
} from '@/lib/api-client';
import { SettingsWorkspace } from './settings-workspace';

function renderWorkspace(identity: Parameters<typeof SettingsWorkspace>[0]['identity']) {
  return render(
    <LanguageProvider initialLocale="en">
      <SettingsWorkspace identity={identity} />
    </LanguageProvider>,
  );
}

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return {
    ...actual,
    getPrivacyPreferences: vi.fn(),
    getSupportedLanguages: vi.fn(),
    updatePrivacyPreferences: vi.fn(),
    updatePreferredLanguage: vi.fn(),
    getConsentStatus: vi.fn(),
    recordConsent: vi.fn(),
  };
});

const privacy = {
  sharePhone: false,
  shareEmail: false,
  allowInAppChat: true,
  privatePickup: false,
  hideSensitiveNotifications: true,
  wantsReservationNotifications: false,
  wantsOperationalAlerts: false,
};

const languages = [
  { code: 'en' as const, name: 'English' },
  { code: 'ta' as const, name: 'Tamil' },
];

const identity = {
  name: 'Mira Patel',
  email: 'mira@example.test',
  tenantName: 'Central Pharmacy',
  tenantId: '2f96df49-54a0-4fac-a3fd-e796cb1f1d3d',
  membershipId: '93b31836-6a84-4db9-a935-1c55960c25da',
};

const emptyConsent = [
  { category: 'LOCATION_USE' as const, status: null, updatedAt: null },
  { category: 'NOTIFICATIONS_RESERVATIONS' as const, status: null, updatedAt: null },
  { category: 'NOTIFICATIONS_OPERATIONAL' as const, status: null, updatedAt: null },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getPrivacyPreferences).mockResolvedValue(privacy);
  vi.mocked(getSupportedLanguages).mockResolvedValue(languages);
  vi.mocked(updatePrivacyPreferences).mockImplementation(async (update) => ({
    ...privacy,
    ...update,
  }));
  vi.mocked(updatePreferredLanguage).mockResolvedValue({ message: 'Language updated' });
  vi.mocked(getConsentStatus).mockResolvedValue(emptyConsent);
});

afterEach(() => cleanup());

describe('SettingsWorkspace interactions', () => {
  it('renders connected preferences and signed identity context', async () => {
    renderWorkspace(identity);

    expect(await screen.findByText('Preference controls')).toBeVisible();
    expect(screen.getByText('Mira Patel')).toBeVisible();
    expect(screen.getByText('mira@example.test')).toBeVisible();
    expect(screen.getByText('Central Pharmacy')).toBeVisible();
    expect(screen.getByRole('switch', { name: 'Allow in-app chat' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('sends only changed privacy preferences', async () => {
    renderWorkspace(identity);

    fireEvent.click(await screen.findByRole('switch', { name: 'Private medicine pickup' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save preferences' }));

    await waitFor(() =>
      expect(updatePrivacyPreferences).toHaveBeenCalledWith({ privatePickup: true }),
    );
    expect(await screen.findByText('Privacy preferences saved.')).toBeVisible();
  });

  it('resets unsaved privacy changes without a mutation', async () => {
    renderWorkspace(identity);

    fireEvent.click(await screen.findByRole('switch', { name: 'Share email' }));
    expect(screen.getByText('Unsaved changes')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));

    expect(screen.getByRole('switch', { name: 'Share email' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    expect(screen.getByRole('button', { name: 'Save preferences' })).toBeDisabled();
    expect(updatePrivacyPreferences).not.toHaveBeenCalled();
  });

  it('updates a reviewed supported language without guessing the current value', async () => {
    renderWorkspace(identity);

    fireEvent.change(await screen.findByLabelText('Preferred language'), {
      target: { value: 'ta' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Update language' }));

    await waitFor(() =>
      expect(updatePreferredLanguage).toHaveBeenCalledWith({ preferredLanguage: 'ta' }),
    );
    await waitFor(() => expect(screen.getByText('Preferred language updated.')).toBeVisible());
  });

  it('updates the live rendered UI immediately, not only after a future reload', async () => {
    // This is the exact bug this task closes: saving a language in
    // Settings previously persisted server-side but never touched the
    // document's own lang/dir, unlike the top-navigation LanguageSelector.
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({}));
    renderWorkspace(identity);

    fireEvent.change(await screen.findByLabelText('Preferred language'), {
      target: { value: 'ta' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Update language' }));

    await waitFor(() => expect(updatePreferredLanguage).toHaveBeenCalled());
    await waitFor(() => expect(document.documentElement.lang).toBe('ta'));
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('fails closed when initial settings cannot be loaded', async () => {
    vi.mocked(getPrivacyPreferences).mockRejectedValue(new Error('Session expired'));

    renderWorkspace(identity);

    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load settings.');
    expect(screen.queryByText('Preference controls')).not.toBeInTheDocument();
  });
});
