import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, login } from '@/lib/api-client';
import { LoginForm } from './login-form';

const replace = vi.fn();
const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, refresh }),
}));

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return { ...actual, login: vi.fn() };
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(login).mockResolvedValue({
    expiresIn: 3600,
    user: { id: 'user-1', email: 'operator@example.com', firstName: 'Mira', lastName: 'Patel' },
    context: { membershipId: '93b31836-6a84-4db9-a935-1c55960c25da', tenantId: 'tenant-1' },
  });
});

afterEach(() => cleanup());

describe('LoginForm interactions', () => {
  it('rejects invalid fields without calling the API', () => {
    render(<LoginForm />);

    fill('Organization slug', 'Invalid Tenant');
    fill('Work email', 'invalid');
    fill('Password', 'too-short');
    fireEvent.click(screen.getByRole('button', { name: 'Sign in securely' }));

    expect(
      screen.getByText('Use the organization slug provided by your administrator.'),
    ).toBeVisible();
    expect(screen.getByText('Enter a valid email address.')).toBeVisible();
    expect(login).not.toHaveBeenCalled();
  });

  it('announces field-level validation errors to assistive technology', () => {
    render(<LoginForm />);

    fill('Work email', 'invalid');
    fireEvent.click(screen.getByRole('button', { name: 'Sign in securely' }));

    const alerts = screen.getAllByRole('alert');
    expect(alerts.some((el) => el.textContent === 'Enter a valid email address.')).toBe(true);
  });

  it('submits the normalized request and navigates to the dashboard', async () => {
    render(<LoginForm />);

    fill('Organization slug', 'central-pharmacy');
    fill('Work email', ' OPERATOR@EXAMPLE.COM ');
    fill('Password', 'a-secure-password');
    fireEvent.click(screen.getByRole('button', { name: 'Sign in securely' }));

    await waitFor(() =>
      expect(login).toHaveBeenCalledWith({
        tenantSlug: 'central-pharmacy',
        email: 'operator@example.com',
        password: 'a-secure-password',
      }),
    );
    expect(replace).toHaveBeenCalledWith('/dashboard');
    expect(refresh).toHaveBeenCalled();
  });

  it('prevents duplicate submission while a request is pending, then recovers on error', async () => {
    const pendingLogin = deferred<Awaited<ReturnType<typeof login>>>();
    vi.mocked(login).mockReturnValueOnce(pendingLogin.promise);
    render(<LoginForm />);

    fill('Organization slug', 'central-pharmacy');
    fill('Work email', 'operator@example.com');
    fill('Password', 'a-secure-password');
    const submit = screen.getByRole('button', { name: 'Sign in securely' });
    fireEvent.click(submit);

    // The control must reflect the pending state and disable itself before
    // any second attempt is made.
    expect(await screen.findByText('Signing in…')).toBeVisible();
    expect(submit).toBeDisabled();

    // A second click while the first request is still in flight must not
    // trigger a second call.
    fireEvent.click(submit);
    expect(login).toHaveBeenCalledTimes(1);

    pendingLogin.reject(new ApiError('Invalid credentials', 401));

    expect(await screen.findByText('Invalid credentials')).toBeVisible();
    expect(submit).not.toBeDisabled();
    expect(screen.getByText('Sign in securely')).toBeVisible();
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
