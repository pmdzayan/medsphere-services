import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '@/components/language-provider';
import { ApiError, identifyLogin, selectOrganizationLogin } from '@/lib/api-client';
import type { AuthenticatedSession } from '@/lib/auth-contract';
import { LoginForm } from './login-form';

const replace = vi.fn();
const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, refresh }),
}));

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return { ...actual, identifyLogin: vi.fn(), selectOrganizationLogin: vi.fn() };
});

const singleMembershipSession: AuthenticatedSession = {
  expiresIn: 3600,
  user: {
    id: 'user-1',
    email: 'operator@example.com',
    firstName: 'Mira',
    lastName: 'Patel',
    preferredLanguage: 'en',
  },
  context: {
    membershipId: '93b31836-6a84-4db9-a935-1c55960c25da',
    tenantId: 'tenant-1',
    tenantName: 'Central Hospital',
    organizationType: 'HOSPITAL',
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  vi.mocked(identifyLogin).mockResolvedValue(singleMembershipSession);
});

afterEach(() => cleanup());

function renderLoginForm() {
  return render(
    <LanguageProvider>
      <LoginForm />
    </LanguageProvider>,
  );
}

describe('LoginForm interactions', () => {
  it('never renders an organization slug or tenant field of any kind', () => {
    renderLoginForm();
    expect(screen.queryByLabelText(/organization slug/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/tenant/i)).not.toBeInTheDocument();
  });

  it('rejects invalid fields without calling the API', () => {
    renderLoginForm();

    fill('Work email', 'invalid');
    fill('Password', 'too-short');
    fireEvent.click(screen.getByRole('button', { name: 'Sign in securely' }));

    expect(screen.getByText('Enter a valid email address.')).toBeVisible();
    expect(screen.getByText('Password must be between 15 and 128 characters.')).toBeVisible();
    expect(identifyLogin).not.toHaveBeenCalled();
  });

  it('announces field-level validation errors to assistive technology', () => {
    renderLoginForm();

    fill('Work email', 'invalid');
    fireEvent.click(screen.getByRole('button', { name: 'Sign in securely' }));

    const alerts = screen.getAllByRole('alert');
    expect(alerts.some((el) => el.textContent === 'Enter a valid email address.')).toBe(true);
  });

  it('submits identity alone (no tenant slug) and navigates directly when exactly one membership exists', async () => {
    renderLoginForm();

    fill('Work email', ' OPERATOR@EXAMPLE.COM ');
    fill('Password', 'a-secure-password');
    fireEvent.click(screen.getByRole('button', { name: 'Sign in securely' }));

    await waitFor(() =>
      expect(identifyLogin).toHaveBeenCalledWith({
        email: 'operator@example.com',
        password: 'a-secure-password',
      }),
    );
    expect(replace).toHaveBeenCalledWith('/dashboard');
    expect(refresh).toHaveBeenCalled();
    expect(selectOrganizationLogin).not.toHaveBeenCalled();
  });

  it('shows only bounded organization display info -- never a search -- when multiple memberships exist, then completes login on selection', async () => {
    vi.mocked(identifyLogin).mockResolvedValue({
      requiresOrganizationSelection: true,
      organizations: [
        {
          membershipId: 'membership-1',
          organizationName: 'Central Hospital',
          organizationType: 'HOSPITAL',
        },
        {
          membershipId: 'membership-2',
          organizationName: 'Riverside Pharmacy',
          organizationType: 'PHARMACY',
        },
      ],
    });
    vi.mocked(selectOrganizationLogin).mockResolvedValue(singleMembershipSession);

    renderLoginForm();

    fill('Work email', 'operator@example.com');
    fill('Password', 'a-secure-password');
    fireEvent.click(screen.getByRole('button', { name: 'Sign in securely' }));

    expect(await screen.findByText('Central Hospital')).toBeVisible();
    expect(screen.getByText('Riverside Pharmacy')).toBeVisible();

    fireEvent.click(screen.getByText('Central Hospital'));

    await waitFor(() =>
      expect(selectOrganizationLogin).toHaveBeenCalledWith({
        email: 'operator@example.com',
        password: 'a-secure-password',
        membershipId: 'membership-1',
      }),
    );
    expect(replace).toHaveBeenCalledWith('/dashboard');
  });

  it('prevents duplicate submission while a request is pending, then recovers on error', async () => {
    const pendingLogin = deferred<Awaited<ReturnType<typeof identifyLogin>>>();
    vi.mocked(identifyLogin).mockReturnValueOnce(pendingLogin.promise);
    renderLoginForm();

    fill('Work email', 'operator@example.com');
    fill('Password', 'a-secure-password');
    const submit = screen.getByRole('button', { name: 'Sign in securely' });
    fireEvent.click(submit);

    expect(await screen.findByText('Signing in…')).toBeVisible();
    expect(submit).toBeDisabled();

    fireEvent.click(submit);
    expect(identifyLogin).toHaveBeenCalledTimes(1);

    pendingLogin.reject(new ApiError('unbounded backend English must not be reflected', 401));

    expect(await screen.findByText('Sign-in failed.')).toBeVisible();
    expect(
      screen.queryByText('unbounded backend English must not be reflected'),
    ).not.toBeInTheDocument();
    expect(submit).not.toBeDisabled();
    expect(screen.getByText('Sign in securely')).toBeVisible();
  });

  it('preserves an RTL locale through organization selection', async () => {
    vi.mocked(identifyLogin).mockResolvedValue({
      requiresOrganizationSelection: true,
      organizations: [
        {
          membershipId: 'membership-1',
          organizationName: 'Central Hospital',
          organizationType: 'HOSPITAL',
        },
      ],
    });
    vi.mocked(selectOrganizationLogin).mockResolvedValue({
      ...singleMembershipSession,
      user: { ...singleMembershipSession.user, preferredLanguage: 'ur' },
    });

    const { container } = render(
      <LanguageProvider initialLocale="ur">
        <LoginForm />
      </LanguageProvider>,
    );
    fireEvent.change(container.querySelector('input[name="email"]')!, {
      target: { value: 'operator@example.com' },
    });
    fireEvent.change(container.querySelector('input[name="password"]')!, {
      target: { value: 'a-secure-password' },
    });
    fireEvent.submit(container.querySelector('form')!);

    expect(await screen.findByText('Central Hospital')).toBeVisible();
    expect(document.documentElement.lang).toBe('ur');
    expect(document.documentElement.dir).toBe('rtl');
    fireEvent.click(screen.getByText('Central Hospital'));
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/dashboard'));
    expect(document.documentElement.lang).toBe('ur');
    expect(document.documentElement.dir).toBe('rtl');
  });
});

function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
