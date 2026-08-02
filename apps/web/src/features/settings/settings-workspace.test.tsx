import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getPrivacyPreferences,
  getSupportedLanguages,
  updatePreferredLanguage,
  updatePrivacyPreferences,
} from '@/lib/api-client';
import { SettingsWorkspace } from './settings-workspace';

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return {
    ...actual,
    getPrivacyPreferences: vi.fn(),
    getSupportedLanguages: vi.fn(),
    updatePrivacyPreferences: vi.fn(),
    updatePreferredLanguage: vi.fn(),
  };
});

const privacy = {
  sharePhone: false,
  shareEmail: false,
  allowInAppChat: true,
  privatePickup: false,
  hideSensitiveNotifications: true,
};

const languages = [
  { code: 'en' as const, name: 'English' },
  { code: 'ta' as const, name: 'Tamil' },
];

const identity = {
  name: 'Mira Patel',
  email: 'mira@example.test',
  tenantSlug: 'central-pharmacy',
  tenantId: '2f96df49-54a0-4fac-a3fd-e796cb1f1d3d',
  membershipId: '93b31836-6a84-4db9-a935-1c55960c25da',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getPrivacyPreferences).mockResolvedValue(privacy);
  vi.mocked(getSupportedLanguages).mockResolvedValue(languages);
  vi.mocked(updatePrivacyPreferences).mockImplementation(async (update) => ({
    ...privacy,
    ...update,
  }));
  vi.mocked(updatePreferredLanguage).mockResolvedValue({ message: 'Language updated' });
});

afterEach(() => cleanup());

describe('SettingsWorkspace interactions', () => {
  it('renders connected preferences and signed identity context', async () => {
    render(<SettingsWorkspace identity={identity} />);

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
    render(<SettingsWorkspace identity={identity} />);

    fireEvent.click(await screen.findByRole('switch', { name: 'Private medicine pickup' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save preferences' }));

    await waitFor(() =>
      expect(updatePrivacyPreferences).toHaveBeenCalledWith({ privatePickup: true }),
    );
    expect(await screen.findByText('Privacy preferences saved.')).toBeVisible();
  });

  it('resets unsaved privacy changes without a mutation', async () => {
    render(<SettingsWorkspace identity={identity} />);

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
    render(<SettingsWorkspace identity={identity} />);

    fireEvent.change(await screen.findByLabelText('Preferred language'), {
      target: { value: 'ta' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Update language' }));

    await waitFor(() =>
      expect(updatePreferredLanguage).toHaveBeenCalledWith({ preferredLanguage: 'ta' }),
    );
    expect(await screen.findByText('Language updated')).toBeVisible();
  });

  it('fails closed when initial settings cannot be loaded', async () => {
    vi.mocked(getPrivacyPreferences).mockRejectedValue(new Error('Session expired'));

    render(<SettingsWorkspace identity={identity} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Session expired');
    expect(screen.queryByText('Preference controls')).not.toBeInTheDocument();
  });
});
