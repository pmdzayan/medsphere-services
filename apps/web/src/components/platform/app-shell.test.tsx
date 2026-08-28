import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '@/components/language-provider';
import type { SessionProfile } from '@/lib/session-profile';
import { AppShell } from './app-shell';

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
}));

afterEach(() => cleanup());

const session: SessionProfile = {
  user: { id: 'user-1', email: 'mira@example.test', firstName: 'Mira', lastName: 'Patel' },
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
      <AppShell session={session}>
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

describe('AppShell mobile navigation', () => {
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
