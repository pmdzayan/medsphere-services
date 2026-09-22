import '@testing-library/jest-dom/vitest';

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LanguageProvider } from '@/components/language-provider';
import { googleLogin, selectGoogleOrganizationLogin } from '@/lib/api-client';
import { GoogleSignIn } from './google-sign-in';

const replace = vi.fn();
const refresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, refresh }),
}));

vi.mock('next/script', () => ({
  default: ({ onLoad }: { onLoad?: () => void }) => (
    <button type="button" onClick={onLoad}>
      load-google-script
    </button>
  ),
}));

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return {
    ...actual,
    googleLogin: vi.fn(),
    selectGoogleOrganizationLogin: vi.fn(),
  };
});

function renderGoogleSignIn(onSelectionStateChange = vi.fn()) {
  return render(
    <LanguageProvider initialLocale="en">
      <GoogleSignIn onSelectionStateChange={onSelectionStateChange} />
    </LanguageProvider>,
  );
}

describe('GoogleSignIn', () => {
  let credentialCallback: ((response: { credential?: string }) => void) | undefined;

  const initialize = vi.fn(
    (options: { client_id: string; callback: (response: { credential?: string }) => void }) => {
      credentialCallback = options.callback;
    },
  );

  const renderButton = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    credentialCallback = undefined;
    process.env.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID = 'google-client-id';
    window.google = {
      accounts: { id: { initialize, renderButton } },
    };
  });

  afterEach(() => {
    cleanup();
    delete process.env.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID;
    delete window.google;
  });

  it('shows a clear disabled local-development option instead of silently disappearing without a client ID', () => {
    delete process.env.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID;
    renderGoogleSignIn();

    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeDisabled();
    expect(
      screen.getByText(/Google sign-in is visible but not configured for this local environment/i),
    ).toBeVisible();
  });

  it('initializes Google with the configured client ID', () => {
    renderGoogleSignIn();
    fireEvent.click(screen.getByRole('button', { name: 'load-google-script' }));
    expect(initialize).toHaveBeenCalledWith(
      expect.objectContaining({ client_id: 'google-client-id' }),
    );
    expect(renderButton).toHaveBeenCalled();
  });

  it('exchanges only the Google proof for a single-membership session', async () => {
    vi.mocked(googleLogin).mockResolvedValue(session('PHARMACY'));

    renderGoogleSignIn();
    fireEvent.click(screen.getByRole('button', { name: 'load-google-script' }));
    await act(async () => {
      await credentialCallback?.({ credential: 'google-id-token' });
    });

    await waitFor(() => expect(googleLogin).toHaveBeenCalledWith({ idToken: 'google-id-token' }));
    expect(replace).toHaveBeenCalledWith('/dashboard');
    expect(refresh).toHaveBeenCalled();
  });

  it('routes a personal Google identity to the patient workspace', async () => {
    vi.mocked(googleLogin).mockResolvedValue(session('NONE'));

    renderGoogleSignIn();
    fireEvent.click(screen.getByRole('button', { name: 'load-google-script' }));
    await act(async () => {
      await credentialCallback?.({ credential: 'google-id-token' });
    });

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/patient/dashboard'));
  });

  it('lets the verified Google identity choose only from returned memberships', async () => {
    vi.mocked(googleLogin).mockResolvedValue({
      requiresOrganizationSelection: true,
      organizations: [
        {
          membershipId: '93b31836-6a84-4db9-a935-1c55960c25da',
          organizationName: 'Central Pharmacy',
          organizationType: 'PHARMACY',
        },
        {
          membershipId: 'd79a711a-239f-4756-8bb4-9397623569bd',
          organizationName: 'Riverside Hospital',
          organizationType: 'HOSPITAL',
        },
      ],
    });
    vi.mocked(selectGoogleOrganizationLogin).mockResolvedValue(session('HOSPITAL'));
    const stateChange = vi.fn();

    renderGoogleSignIn(stateChange);
    fireEvent.click(screen.getByRole('button', { name: 'load-google-script' }));
    await act(async () => {
      await credentialCallback?.({ credential: 'google-id-token' });
    });

    expect(await screen.findByText('Central Pharmacy')).toBeVisible();
    expect(screen.getByText('Riverside Hospital')).toBeVisible();
    expect(stateChange).toHaveBeenCalledWith(true);

    fireEvent.click(screen.getByRole('button', { name: 'Riverside Hospital' }));
    await waitFor(() =>
      expect(selectGoogleOrganizationLogin).toHaveBeenCalledWith({
        idToken: 'google-id-token',
        membershipId: 'd79a711a-239f-4756-8bb4-9397623569bd',
      }),
    );
    expect(replace).toHaveBeenCalledWith('/dashboard');
  });

  it('surfaces a bounded Google failure', async () => {
    vi.mocked(googleLogin).mockRejectedValue(new Error('secret upstream detail'));

    renderGoogleSignIn();
    fireEvent.click(screen.getByRole('button', { name: 'load-google-script' }));
    await act(async () => {
      await credentialCallback?.({ credential: 'google-id-token' });
    });

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Google sign-in failed. Try again.'),
    );
    expect(screen.queryByText('secret upstream detail')).toBeNull();
    expect(replace).not.toHaveBeenCalled();
  });
});

function session(organizationType: 'PHARMACY' | 'HOSPITAL' | 'NONE') {
  return {
    expiresIn: 900,
    user: {
      id: 'user-1',
      email: 'user@example.com',
      firstName: 'Test',
      lastName: 'User',
      preferredLanguage: 'en' as const,
    },
    context: {
      membershipId: '93b31836-6a84-4db9-a935-1c55960c25da',
      tenantId: 'd79a711a-239f-4756-8bb4-9397623569bd',
      tenantName: organizationType === 'NONE' ? 'AIM Personal Accounts' : 'Central Provider',
      organizationType,
    },
  };
}
