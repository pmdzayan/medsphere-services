import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BRAND } from '@medsphere/brand';
import { LanguageProvider } from '@/components/language-provider';
import type { SessionProfile } from '@/lib/session-profile';
import { AppShell } from './app-shell';

let pathname = '/dashboard';

vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
}));

vi.mock('next/script', () => ({
  default: ({ onLoad }: { onLoad?: () => void }) => (
    <button type="button" onClick={onLoad}>
      load-google-script
    </button>
  ),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  pathname = '/dashboard';
});

const session: SessionProfile = {
  user: {
    id: 'user-1',
    email: 'mira@example.test',
    firstName: 'Mira',
    lastName: 'Patel',
    preferredLanguage: 'en',
  },
  context: {
    membershipId: '93b31836-6a84-4db9-a935-1c55960c25da',
    tenantId: '2f96df49-54a0-4fac-a3fd-e796cb1f1d3d',
    tenantName: 'Central Pharmacy',
    organizationType: 'PHARMACY',
  },
  expiresIn: 3600,
};

function renderShell() {
  const utils = render(
    <LanguageProvider>
      <AppShell
        session={session}
        initialWorkstationState={{
          locked: false,
          lockedAt: null,
          securityVersion: 1,
        }}
      >
        <p>Workspace content</p>
      </AppShell>
    </LanguageProvider>,
  );
  function getDrawerCloseButton() {
    const aside = utils.container.querySelector('aside:not([class*="fixed inset-y-0"])');
    if (!aside) throw new Error('Mobile drawer aside not found');
    return within(aside as HTMLElement).getByRole('button', { name: 'Close navigation' });
  }
  return { ...utils, getDrawerCloseButton };
}

describe('AppShell workstation lock boundary', () => {
  it('never mounts protected workspace content while the server says the session is locked', () => {
    render(
      <LanguageProvider>
        <AppShell
          session={session}
          initialWorkstationState={{
            locked: true,
            lockedAt: '2026-09-02T09:00:00.000Z',
            securityVersion: 2,
          }}
        >
          <p>Highly protected workspace content</p>
        </AppShell>
      </LanguageProvider>,
    );

    expect(screen.queryByText('Highly protected workspace content')).not.toBeInTheDocument();

    expect(screen.queryByRole('button', { name: 'Open navigation' })).not.toBeInTheDocument();
  });
});

describe('AppShell workstation interaction security', () => {
  it('hides protected content immediately when workstation locking begins', async () => {
    let resolveLock!: (value: Response) => void;

    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            resolveLock = resolve;
          }),
      ),
    );

    renderShell();

    fireEvent.click(screen.getByRole('button', { name: 'Open account menu' }));
    fireEvent.click(screen.getByRole('button', { name: 'Lock workstation' }));

    expect(screen.queryByText('Workspace content')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Workstation locked' })).toBeInTheDocument();

    resolveLock(Response.json({ locked: true }));
  });

  it('keeps protected content unmounted after a failed password unlock', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ message: 'Invalid unlock credential' }, { status: 401 }),
        ),
    );

    render(
      <LanguageProvider>
        <AppShell
          session={session}
          initialWorkstationState={{
            locked: true,
            lockedAt: '2026-09-02T09:00:00.000Z',
            securityVersion: 2,
          }}
        >
          <p>Protected patient workspace</p>
        </AppShell>
      </LanguageProvider>,
    );

    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: '123456789012345' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Unlock workstation' }));

    await waitFor(() => {
      expect(
        screen.getByText('Unable to unlock the workstation. Check your credential and try again.'),
      ).toBeInTheDocument();
    });

    expect(screen.queryByText('Protected patient workspace')).not.toBeInTheDocument();
  });

  it('requires server-state confirmation before restoring protected content', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ expiresIn: 900 }))
      .mockResolvedValueOnce(
        Response.json({
          locked: true,
          lockedAt: '2026-09-02T09:00:00.000Z',
          securityVersion: 2,
        }),
      );

    vi.stubGlobal('fetch', fetchMock);

    render(
      <LanguageProvider>
        <AppShell
          session={session}
          initialWorkstationState={{
            locked: true,
            lockedAt: '2026-09-02T09:00:00.000Z',
            securityVersion: 2,
          }}
        >
          <p>Protected patient workspace</p>
        </AppShell>
      </LanguageProvider>,
    );

    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: '123456789012345' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Unlock workstation' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/auth/unlock');
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/auth/session-state');

    expect(screen.queryByText('Protected patient workspace')).not.toBeInTheDocument();
  });
});

describe('AppShell workstation lock reconciliation', () => {
  it('restores protected content after a failed lock only when the server confirms the session is active', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ message: 'Lock failed' }, { status: 503 }))
      .mockResolvedValueOnce(
        Response.json({
          locked: false,
          lockedAt: null,
          securityVersion: 1,
        }),
      );

    vi.stubGlobal('fetch', fetchMock);

    renderShell();

    fireEvent.click(screen.getByRole('button', { name: 'Open account menu' }));
    fireEvent.click(screen.getByRole('button', { name: 'Lock workstation' }));

    expect(screen.queryByText('Workspace content')).not.toBeInTheDocument();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    await waitFor(() => {
      expect(screen.getByText('Workspace content')).toBeInTheDocument();
    });

    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/auth/session-state');
  });
});

describe('AppShell Google workstation unlock security', () => {
  it('does not restore protected content until Google unlock is server-confirmed', async () => {
    let credentialCallback: ((response: { credential?: string }) => void) | undefined;

    process.env.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID = 'google-client-id';

    window.google = {
      accounts: {
        id: {
          initialize: vi.fn(
            (options: {
              client_id: string;
              callback: (response: { credential?: string }) => void;
            }) => {
              credentialCallback = options.callback;
            },
          ),
          renderButton: vi.fn(),
        },
      },
    };

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ expiresIn: 900 }))
      .mockResolvedValueOnce(
        Response.json({
          locked: true,
          lockedAt: '2026-09-02T09:00:00.000Z',
          securityVersion: 2,
        }),
      );

    vi.stubGlobal('fetch', fetchMock);

    render(
      <LanguageProvider>
        <AppShell
          session={session}
          initialWorkstationState={{
            locked: true,
            lockedAt: '2026-09-02T09:00:00.000Z',
            securityVersion: 2,
          }}
        >
          <p>Protected patient workspace</p>
        </AppShell>
      </LanguageProvider>,
    );

    const script = screen.queryByText('load-google-script');
    if (script) {
      fireEvent.click(script);
    }

    await waitFor(() => {
      expect(credentialCallback).toBeTypeOf('function');
    });

    await act(async () => {
      await credentialCallback?.({
        credential: 'google-id-token',
      });
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    expect(JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body))).toEqual({
      googleIdToken: 'google-id-token',
    });

    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/auth/session-state');
    expect(screen.queryByText('Protected patient workspace')).not.toBeInTheDocument();

    delete process.env.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID;
    delete window.google;
  });
});

describe('AppShell mobile navigation', () => {
  it.each(['/dashboard', '/settings'])(
    'carries the approved brand through the protected %s workspace',
    (route) => {
      pathname = route;
      renderShell();
      expect(
        screen.getAllByRole('link', { name: /AIM.*All In Medico.*home/i }).length,
      ).toBeGreaterThan(0);
    },
  );

  it('uses the compact AIM identity with the full accessible brand name', () => {
    renderShell();
    const brandLinks = screen.getAllByRole('link', { name: /AIM.*All In Medico/i });
    expect(brandLinks.length).toBeGreaterThan(0);
    expect(screen.getAllByText(BRAND.shortName).length).toBeGreaterThan(0);
    expect(screen.getAllByText(BRAND.fullName).length).toBeGreaterThan(0);
  });

  it('does not move focus to the navigation trigger on initial render', () => {
    renderShell();
    const trigger = screen.getByRole('button', { name: 'Open navigation' });
    expect(trigger).not.toHaveFocus();
    expect(document.body).toHaveFocus();
  });

  it('opens the drawer and moves focus to its close control', async () => {
    const { getDrawerCloseButton } = renderShell();
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    expect(getDrawerCloseButton()).toHaveFocus();
  });

  it('closes the drawer on Escape and returns focus to the trigger', async () => {
    renderShell();
    const trigger = screen.getByRole('button', { name: 'Open navigation' });
    fireEvent.click(trigger);
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());

    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(trigger).toHaveFocus();
  });

  it('closes the drawer when the overlay is dismissed', async () => {
    const { getDrawerCloseButton } = renderShell();
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());

    fireEvent.click(getDrawerCloseButton());

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
});

describe('AppShell account menu', () => {
  it('closes on Escape', async () => {
    renderShell();
    fireEvent.click(screen.getByRole('button', { name: 'Open account menu' }));
    await waitFor(() => {
      expect(screen.getByText('mira@example.test')).toBeInTheDocument();
    });

    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByText('mira@example.test')).not.toBeInTheDocument();
    });
  });

  it('closes when clicking outside the menu', async () => {
    renderShell();
    fireEvent.click(screen.getByRole('button', { name: 'Open account menu' }));
    await waitFor(() => {
      expect(screen.getByText('mira@example.test')).toBeInTheDocument();
    });

    fireEvent.pointerDown(document.body);

    await waitFor(() => {
      expect(screen.queryByText('mira@example.test')).not.toBeInTheDocument();
    });
  });
});

describe('AppShell mobile bottom navigation', () => {
  it('only surfaces primary, available items to keep touch targets comfortable', () => {
    renderShell();
    const bottomNav = screen.getByRole('navigation', { name: 'Mobile navigation' });
    expect(bottomNav.querySelectorAll('a')).toHaveLength(3);
    expect(screen.getByRole('button', { name: /More navigation/ })).toBeInTheDocument();
  });
});
