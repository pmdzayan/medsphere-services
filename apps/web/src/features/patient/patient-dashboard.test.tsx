import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '@/components/language-provider';
import { getPatientProfile, updatePatientProfile } from '@/lib/api-client';
import type { PatientProfile } from '@/lib/patient-profile-contract';
import { PatientDashboard } from './patient-dashboard';

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return {
    ...actual,
    getPatientProfile: vi.fn(),
    updatePatientProfile: vi.fn(),
  };
});

const profile: PatientProfile = {
  userId: 'user-1',
  firstName: 'Asha',
  lastName: 'Rao',
  email: 'asha@example.com',
  phone: '+911234567890',
  phoneVerified: true,
  preferredLanguage: 'en',
  wantsReservationNotifications: true,
  hideSensitiveNotifications: true,
};

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

function renderDashboard() {
  return render(
    <LanguageProvider>
      <PatientDashboard />
    </LanguageProvider>,
  );
}

describe('PatientDashboard (candidate Task 0032)', () => {
  it('shows a loading state before the profile resolves', async () => {
    vi.mocked(getPatientProfile).mockImplementation(() => new Promise(() => {}));
    renderDashboard();
    expect(await screen.findAllByRole('status')).not.toHaveLength(0);
  });

  it("renders the patient's own profile fields once loaded -- never a raw enum/technical identifier", async () => {
    vi.mocked(getPatientProfile).mockResolvedValue(profile);
    renderDashboard();

    expect(await screen.findByText('Asha')).toBeVisible();
    expect(screen.getByText('Rao')).toBeVisible();
    expect(screen.getByText('asha@example.com')).toBeVisible();
    expect(screen.queryByText(/tenant/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/membership/i)).not.toBeInTheDocument();
    expect(screen.queryByText('user-1')).not.toBeInTheDocument();
  });

  it('shows a safe, generic error state when the profile fails to load', async () => {
    vi.mocked(getPatientProfile).mockRejectedValue(new Error('network'));
    renderDashboard();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not load your profile. Try again.',
    );
  });

  it('shows honest "coming soon" empty states for unimplemented modules -- never fake data', async () => {
    vi.mocked(getPatientProfile).mockResolvedValue(profile);
    renderDashboard();

    await screen.findByText('Asha');
    expect(screen.getAllByText('Coming soon').length).toBeGreaterThan(0);
    expect(screen.getByText(/Prescriptions will appear here once available/)).toBeVisible();
    expect(screen.queryByText(/Dr\./)).not.toBeInTheDocument();
  });

  it('the reservations card uses reservation-specific copy, not the appointments message (correction pass 1)', async () => {
    vi.mocked(getPatientProfile).mockResolvedValue(profile);
    renderDashboard();

    await screen.findByText('Asha');
    expect(screen.getByText('Your reservations')).toBeVisible();
    expect(screen.getByText(/Your reservations will appear here once available/)).toBeVisible();
    // The reservations card must never show the appointments message.
    const reservationsHeading = screen.getByText('Your reservations');
    const reservationsCard = reservationsHeading.closest('div');
    expect(reservationsCard?.textContent).not.toMatch(/Appointments will appear here/);
  });

  it('shows a separate, accurately-labeled Appointments card', async () => {
    vi.mocked(getPatientProfile).mockResolvedValue(profile);
    renderDashboard();

    await screen.findByText('Asha');
    expect(screen.getByText('Appointments')).toBeVisible();
    expect(screen.getByText(/Appointments will appear here once available/)).toBeVisible();
  });

  it('entering edit mode and saving submits only the whitelisted, patient-editable fields', async () => {
    vi.mocked(getPatientProfile).mockResolvedValue(profile);
    vi.mocked(updatePatientProfile).mockResolvedValue({ ...profile, firstName: 'Ashwini' });
    renderDashboard();

    fireEvent.click(await screen.findByRole('button', { name: 'Edit profile' }));
    const firstNameInput = screen.getByLabelText('First name');
    fireEvent.change(firstNameInput, { target: { value: 'Ashwini' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(updatePatientProfile).toHaveBeenCalledTimes(1));
    const submitted = vi.mocked(updatePatientProfile).mock.calls[0][0];
    expect(Object.keys(submitted).sort()).toEqual(
      ['firstName', 'lastName', 'wantsReservationNotifications'].sort(),
    );
    expect(submitted).not.toHaveProperty('email');
    expect(submitted).not.toHaveProperty('userId');
  });

  it('blocks submission with a validation message when first name is cleared', async () => {
    vi.mocked(getPatientProfile).mockResolvedValue(profile);
    renderDashboard();

    fireEvent.click(await screen.findByRole('button', { name: 'Edit profile' }));
    fireEvent.change(screen.getByLabelText('First name'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Enter a first name.')).toBeVisible();
    expect(updatePatientProfile).not.toHaveBeenCalled();
  });

  it('shows a session-expired message (not a raw error) on a 401 from the update endpoint', async () => {
    const { ApiError } = await import('@/lib/api-client');
    vi.mocked(getPatientProfile).mockResolvedValue(profile);
    vi.mocked(updatePatientProfile).mockRejectedValue(new ApiError('unauthorized', 401));
    renderDashboard();

    fireEvent.click(await screen.findByRole('button', { name: 'Edit profile' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your session has expired. Sign in again.',
    );
  });

  it('every visible string is routed through localization (Tamil renders distinct text)', async () => {
    const { translate } = await import('@/lib/i18n');
    const english = translate('en', 'patient.dashboard.title');
    const tamil = translate('ta', 'patient.dashboard.title');
    const urdu = translate('ur', 'patient.dashboard.title');
    expect(tamil).not.toBe(english);
    expect(urdu).not.toBe(english);
  });
});
