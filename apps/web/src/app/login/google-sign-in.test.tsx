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
      accounts: {
        id: {
          initialize,
          renderButton,
        },
      },
    };
  });

  afterEach(() => {
    cleanup();
    delete process.env.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID;
    delete window.google;
  });

  it('does not expose Google sign-in when the client ID is absent', () => {
    delete process.env.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID;
    const { container } = renderGoogleSignIn();
    expect(container).toBeEmptyDOMElement();
  });

  it('initializes Google with the configured client ID', () => {
    renderGoogleSignIn();
    fireEvent.click(screen.getByRole('button', { name: 'load-google-script' }));
    expect(initialize).toHaveBeenCalledWith(
      expect.objectContaining({ client_id: 'google-client-id' }),
    );
    expect(renderButton).toHaveBeenCalled();
  });

  it('exchanges only the verified Google credential for a single-membership session', async () => {
    vi.mocked(googleLogin).mockResolvedValue({
      expiresIn: 900,
      user: {
        id: 'user-1',
        email: 'user@example.com',
        firstName: 'Test',
        lastName: 'User',
        preferredLanguage: 'en',
      },
      context: {
        membershipId: 'membership-1',
        tenantId: 'tenant-1',
        tenantName: 'Central Pharmacy',
        organizationType: 'PHARMACY',
      },
    });

    renderGoogleSignIn();
    fireEvent.click(screen.getByRole('button', { name: 'load-google-script' }));
    await act(async () => {
      await credentialCallback?.({ credential: 'google-id-token' });
    });

    await waitFor(() => {
      expect(googleLogin).toHaveBeenCalledWith({ idToken: 'google-id-token' });
    });
    expect(replace).toHaveBeenCalledWith('/dashboard');
    expect(refresh).toHaveBeenCalled();
  });

  it('lets the verified Google identity choose only from its returned memberships', async () => {
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
    vi.mocked(selectGoogleOrganizationLogin).mockResolvedValue({
      expiresIn: 900,
      user: {
        id: 'user-1',
        email: 'user@example.com',
        firstName: 'Test',
        lastName: 'User',
        preferredLanguage: 'en',
      },
      context: {
        membershipId: 'd79a711a-239f-4756-8bb4-9397623569bd',
        tenantId: 'tenant-2',
        tenantName: 'Riverside Hospital',
        organizationType: 'HOSPITAL',
      },
    });
    const onSelectionStateChange = vi.fn();

    renderGoogleSignIn(onSelectionStateChange);
    fireEvent.click(screen.getByRole('button', { name: 'load-google-script' }));
    await act(async () => {
      await credentialCallback?.({ credential: 'google-id-token' });
    });

    expect(await screen.findByText('Central Pharmacy')).toBeVisible();
    expect(screen.getByText('Riverside Hospital')).toBeVisible();
    expect(onSelectionStateChange).toHaveBeenCalledWith(true);

    fireEvent.click(screen.getByRole('button', { name: 'Riverside Hospital' }));
    await waitFor(() => {
      expect(selectGoogleOrganizationLogin).toHaveBeenCalledWith({
        idToken: 'google-id-token',
        membershipId: 'd79a711a-239f-4756-8bb4-9397623569bd',
      });
    });
    expect(replace).toHaveBeenCalledWith('/dashboard');
  });

  it('surfaces a bounded Google authentication failure', async () => {
    vi.mocked(googleLogin).mockRejectedValue(
      new Error('unbounded identity-provider English must not be reflected'),
    );

    renderGoogleSignIn();
    fireEvent.click(screen.getByRole('button', { name: 'load-google-script' }));
    await act(async () => {
      await credentialCallback?.({ credential: 'google-id-token' });
    });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Google sign-in failed. Try again.');
    });
    expect(
      screen.queryByText('unbounded identity-provider English must not be reflected'),
    ).toBeNull();
    expect(replace).not.toHaveBeenCalled();
  });
});
