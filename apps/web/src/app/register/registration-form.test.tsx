import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '@/components/language-provider';
import { register, requestPhoneOtp, verifyPhoneOtp } from '@/lib/api-client';
import { REGISTRATION_CONFIRMATION_MESSAGE } from '@/lib/auth-contract';
import { RegistrationForm } from './registration-form';

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return { ...actual, register: vi.fn(), requestPhoneOtp: vi.fn(), verifyPhoneOtp: vi.fn() };
});

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  vi.mocked(register).mockResolvedValue({ message: REGISTRATION_CONFIRMATION_MESSAGE });
  vi.mocked(requestPhoneOtp).mockResolvedValue(undefined);
  vi.mocked(verifyPhoneOtp).mockResolvedValue({ activated: true, replayed: false });
});

afterEach(() => cleanup());

describe('RegistrationForm interactions', () => {
  it('never renders an organization slug field of any kind', () => {
    renderForm();
    expect(screen.queryByLabelText(/organization slug/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/tenant/i)).not.toBeInTheDocument();
  });

  it('only offers the fixed, MedSphere-approved organization types', () => {
    renderForm();
    const select = screen.getByLabelText('Organization type') as HTMLSelectElement;
    const options = Array.from(select.querySelectorAll('option'))
      .map((option) => option.getAttribute('value'))
      .filter((value): value is string => Boolean(value));
    expect(options.sort()).toEqual(
      ['PHARMACY', 'HOSPITAL', 'LABORATORY', 'CLINIC', 'BLOOD_BANK', 'SUPPLIER', 'NONE'].sort(),
    );
  });

  it('hides the organization code field until a healthcare type is chosen', () => {
    renderForm();
    expect(screen.queryByLabelText('Organization code / Invitation code')).not.toBeInTheDocument();

    selectOrganizationType('HOSPITAL');
    expect(screen.getByLabelText('Organization code / Invitation code')).toBeInTheDocument();
  });

  it('keeps the organization code field hidden for "None"', () => {
    renderForm();
    selectOrganizationType('NONE');
    expect(screen.queryByLabelText('Organization code / Invitation code')).not.toBeInTheDocument();
  });

  it('rejects invalid fields and mismatched passwords without calling the API', () => {
    renderForm();

    fill('First name', 'Mira');
    fill('Last name', 'Patel');
    selectOrganizationType('HOSPITAL');
    fill('Organization code / Invitation code', 'x');
    fill('Work email', 'invalid');
    fill('Create password', 'a-secure-password');
    fill('Confirm password', 'different-password');
    fireEvent.click(screen.getByRole('button', { name: 'Request organization access' }));

    expect(
      screen.getByText('Enter the organization code provided by your administrator.'),
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

  it('normalizes and submits the accepted registration request for a healthcare type', async () => {
    renderForm();

    fillValidForm('HOSPITAL');
    fireEvent.click(screen.getByRole('button', { name: 'Request organization access' }));

    await waitFor(() =>
      expect(register).toHaveBeenCalledWith({
        organizationType: 'HOSPITAL',
        organizationCode: 'MED-X7P42-Q9K3R',
        email: 'operator@example.com',
        password: 'a-secure-password',
        firstName: 'Mira',
        lastName: 'Patel',
        phone: '+919876543210',
      }),
    );
    expect(await screen.findByText('Your request is safely queued.')).toBeVisible();
    expect(screen.getByText(REGISTRATION_CONFIRMATION_MESSAGE)).toBeVisible();
    expect(requestPhoneOtp).toHaveBeenCalledWith({ email: 'operator@example.com' });
  });

  it('completes slug-free phone verification from the registration confirmation', async () => {
    renderForm();
    fillValidForm('NONE');
    fireEvent.click(screen.getByRole('button', { name: 'Request organization access' }));

    const code = await screen.findByLabelText('Phone verification code');
    fireEvent.change(code, { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify phone' }));

    await waitFor(() =>
      expect(verifyPhoneOtp).toHaveBeenCalledWith({
        email: 'operator@example.com',
        code: '123456',
      }),
    );
    expect(await screen.findByText(/Phone verified/)).toBeVisible();
  });

  it('submits a personal account request with no organization code, for the "None" type', async () => {
    renderForm();

    fill('First name', 'Mira');
    fill('Last name', 'Patel');
    selectOrganizationType('NONE');
    fill('Work email', ' OPERATOR@EXAMPLE.COM ');
    fill('Phone number', ' +91 98765 43210 ');
    fill('Create password', 'a-secure-password');
    fill('Confirm password', 'a-secure-password');
    fireEvent.click(screen.getByRole('button', { name: 'Request organization access' }));

    await waitFor(() =>
      expect(register).toHaveBeenCalledWith({
        organizationType: 'NONE',
        organizationCode: undefined,
        email: 'operator@example.com',
        password: 'a-secure-password',
        firstName: 'Mira',
        lastName: 'Patel',
        phone: '+919876543210',
      }),
    );
  });

  it('shows a bounded service error and preserves the form for correction', async () => {
    vi.mocked(register).mockRejectedValue(
      new Error('Too many onboarding requests. Try again later.'),
    );
    renderForm();

    fillValidForm('HOSPITAL');
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

function selectOrganizationType(value: string) {
  fireEvent.change(screen.getByLabelText('Organization type'), { target: { value } });
}

function fillValidForm(organizationType: string) {
  fill('First name', ' Mira ');
  fill('Last name', ' Patel ');
  selectOrganizationType(organizationType);
  if (organizationType !== 'NONE') {
    fill('Organization code / Invitation code', ' med-x7p42-q9k3r ');
  }
  fill('Work email', ' OPERATOR@EXAMPLE.COM ');
  fill('Phone number', ' +91 98765 43210 ');
  fill('Create password', 'a-secure-password');
  fill('Confirm password', 'a-secure-password');
}

function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}
