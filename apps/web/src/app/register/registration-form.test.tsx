import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '@/components/language-provider';
import { register } from '@/lib/api-client';
import { REGISTRATION_CONFIRMATION_MESSAGE } from '@/lib/auth-contract';
import { RegistrationForm } from './registration-form';

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return { ...actual, register: vi.fn() };
});

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  vi.mocked(register).mockResolvedValue({ message: REGISTRATION_CONFIRMATION_MESSAGE });
});

afterEach(() => cleanup());

describe('RegistrationForm interactions', () => {
  it('rejects invalid fields and mismatched passwords without calling the API', () => {
    renderForm();

    fill('First name', 'Mira');
    fill('Last name', 'Patel');
    fill('Organization slug', 'Invalid Tenant');
    fill('Work email', 'invalid');
    fill('Create password', 'a-secure-password');
    fill('Confirm password', 'different-password');
    fireEvent.click(screen.getByRole('button', { name: 'Request organization access' }));

    expect(
      screen.getByText('Use the organization slug provided by your administrator.'),
    ).toBeVisible();
    expect(screen.getByText('Enter a valid email address.')).toBeVisible();
    expect(screen.getByText('Passwords do not match.')).toBeVisible();
    expect(register).not.toHaveBeenCalled();
  });

  it('announces field-level validation errors to assistive technology', () => {
    renderForm();

    fill('Work email', 'invalid');
    fireEvent.click(screen.getByRole('button', { name: 'Request organization access' }));

    const alerts = screen.getAllByRole('alert');
    expect(alerts.some((el) => el.textContent === 'Enter a valid email address.')).toBe(true);
  });

  it('normalizes and submits the accepted registration request', async () => {
    renderForm();

    fillValidForm();
    fireEvent.click(screen.getByRole('button', { name: 'Request organization access' }));

    await waitFor(() =>
      expect(register).toHaveBeenCalledWith({
        tenantSlug: 'central-pharmacy',
        email: 'operator@example.com',
        password: 'a-secure-password',
        firstName: 'Mira',
        lastName: 'Patel',
      }),
    );
    expect(await screen.findByText('Your request is safely queued.')).toBeVisible();
    expect(screen.getByText(REGISTRATION_CONFIRMATION_MESSAGE)).toBeVisible();
  });

  it('shows a localized bounded service error and preserves the form for correction', async () => {
    vi.mocked(register).mockRejectedValue(
      new Error('Too many onboarding requests. Try again later.'),
    );
    renderForm();

    fillValidForm();
    fireEvent.click(screen.getByRole('button', { name: 'Request organization access' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Unable to process the onboarding request.',
    );
    expect(screen.getByLabelText('Work email')).toHaveValue('OPERATOR@EXAMPLE.COM');
  });

  it('lets the user inspect password fields without altering their values', () => {
    renderForm();

    fill('Create password', 'a-secure-password');
    fill('Confirm password', 'a-secure-password');
    expect(screen.getByLabelText('Create password')).toHaveAttribute('type', 'password');

    fireEvent.click(screen.getByRole('checkbox', { name: 'Show password' }));

    expect(screen.getByLabelText('Create password')).toHaveAttribute('type', 'text');
    expect(screen.getByLabelText('Create password')).toHaveValue('a-secure-password');
  });
});

function renderForm() {
  return render(
    <LanguageProvider>
      <RegistrationForm />
    </LanguageProvider>,
  );
}

function fillValidForm() {
  fill('First name', ' Mira ');
  fill('Last name', ' Patel ');
  fill('Organization slug', ' Central-Pharmacy ');
  fill('Work email', ' OPERATOR@EXAMPLE.COM ');
  fill('Create password', 'a-secure-password');
  fill('Confirm password', 'a-secure-password');
}

function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}
