import '@testing-library/jest-dom/vitest';

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { googleLogin } from '@/lib/api-client';
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
  };
});

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

    const { container } = render(<GoogleSignIn tenantSlug="central-pharmacy" onError={vi.fn()} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('initializes Google with the configured client ID', () => {
    render(<GoogleSignIn tenantSlug="central-pharmacy" onError={vi.fn()} />);

    fireEvent.click(
      screen.getByRole('button', {
        name: 'load-google-script',
      }),
    );

    expect(initialize).toHaveBeenCalledWith(
      expect.objectContaining({
        client_id: 'google-client-id',
      }),
    );

    expect(renderButton).toHaveBeenCalled();
  });

  it('exchanges the Google credential for the tenant-bound session', async () => {
    vi.mocked(googleLogin).mockResolvedValue({
      expiresIn: 900,
      user: {
        id: 'user-1',
        email: 'user@example.com',
        firstName: 'Test',
        lastName: 'User',
      },
      context: {
        membershipId: 'membership-1',
        tenantId: 'tenant-1',
        tenantName: 'Central Pharmacy',
        organizationType: 'PHARMACY',
      },
    });

    const onError = vi.fn();

    render(<GoogleSignIn tenantSlug=" CENTRAL-PHARMACY " onError={onError} />);

    fireEvent.click(
      screen.getByRole('button', {
        name: 'load-google-script',
      }),
    );

    expect(credentialCallback).toBeTypeOf('function');

    await act(async () => {
      await credentialCallback?.({
        credential: 'google-id-token',
      });
    });

    await waitFor(() => {
      expect(googleLogin).toHaveBeenCalledWith({
        tenantSlug: 'central-pharmacy',
        idToken: 'google-id-token',
      });
    });

    expect(replace).toHaveBeenCalledWith('/dashboard');
    expect(refresh).toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith('');
  });

  it('requires the tenant slug before exchanging a Google credential', async () => {
    const onError = vi.fn();

    render(<GoogleSignIn tenantSlug="" onError={onError} />);

    fireEvent.click(
      screen.getByRole('button', {
        name: 'load-google-script',
      }),
    );

    await act(async () => {
      await credentialCallback?.({
        credential: 'google-id-token',
      });
    });

    expect(googleLogin).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(
      'Enter your organization slug before continuing with Google.',
    );
  });

  it('surfaces a bounded Google authentication failure', async () => {
    vi.mocked(googleLogin).mockRejectedValue(new Error('Google sign-in could not be authorized.'));

    const onError = vi.fn();

    render(<GoogleSignIn tenantSlug="central-pharmacy" onError={onError} />);

    fireEvent.click(
      screen.getByRole('button', {
        name: 'load-google-script',
      }),
    );

    await act(async () => {
      await credentialCallback?.({
        credential: 'google-id-token',
      });
    });

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith('Google sign-in could not be authorized.');
    });

    expect(replace).not.toHaveBeenCalled();
  });
});
