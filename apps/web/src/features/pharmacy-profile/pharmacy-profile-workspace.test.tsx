import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '@/components/language-provider';
import {
  getAssignedProviders,
  getPharmacyProfile,
  getPharmacyVerificationState,
  submitPharmacyVerification,
  updatePharmacyProfile,
} from '@/lib/api-client';
import type { PharmacyVerificationState } from '@/lib/pharmacy-verification-contract';
import { PharmacyProfileWorkspace } from './pharmacy-profile-workspace';

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return {
    ...actual,
    getAssignedProviders: vi.fn(),
    getPharmacyProfile: vi.fn(),
    getPharmacyVerificationState: vi.fn(),
    submitPharmacyVerification: vi.fn(),
    updatePharmacyProfile: vi.fn(),
  };
});

const pharmacyId = '11111111-1111-4111-8111-111111111111';

const pharmacy = {
  membershipId: '22222222-2222-4222-8222-222222222222',
  providerId: pharmacyId,
  businessName: 'City Pharmacy',
  providerType: 'PHARMACY' as const,
  isActive: true,
};

const profile = {
  businessName: 'City Pharmacy',
  ownerName: 'Asha Rao',
  email: 'care@city.example',
  phone: '+91 98765 43210',
  address: '10 Market Road',
  city: 'Chennai',
  state: 'Tamil Nadu',
  country: 'India',
  postalCode: '600001',
  latitude: 13.0827,
  longitude: 80.2707,
};

const officialSources = [
  {
    id: 'INDIA_TN_DRUGS_CONTROL',
    authority: 'Tamil Nadu Food Safety & Drugs Administration — Drugs Control',
    label: 'Tamil Nadu Drugs Control — drug sales licensing',
    officialUrl: 'https://drugscontrol.tn.gov.in/sales_services.html',
    requirement: 'PRIMARY' as const,
    mode: 'PORTAL_LOOKUP' as const,
    purpose: 'PREMISES_LICENCE',
    limitation: 'Primary Tamil Nadu source for retail/wholesale drug-sale licensing.',
  },
  {
    id: 'INDIA_TN_PHARMACY_COUNCIL',
    authority: 'Tamil Nadu Pharmacy Council',
    label: 'Tamil Nadu Pharmacy Council',
    officialUrl: 'https://tnpc.ac.in/',
    requirement: 'PRIMARY' as const,
    mode: 'PORTAL_LOOKUP' as const,
    purpose: 'PROFESSIONAL_REGISTRATION',
    limitation: 'Use for Tamil Nadu pharmacist registration evidence.',
  },
];

const approvedState: PharmacyVerificationState = {
  current: {
    verificationId: '33333333-3333-4333-8333-333333333333',
    status: 'APPROVED',
    submittedAt: '2026-09-01T10:00:00.000Z',
    licenseExpiryDate: '2027-09-01T00:00:00.000Z',
    applicantMessage: null,
    version: 2,
  },
  openSubmission: null,
  verificationSources: officialSources,
  jurisdictionReviewRequired: false,
  jurisdictionNote: null,
};

function renderWorkspace() {
  return render(
    <LanguageProvider>
      <PharmacyProfileWorkspace />
    </LanguageProvider>,
  );
}

beforeEach(() => {
  vi.mocked(getAssignedProviders).mockResolvedValue([pharmacy]);
  vi.mocked(getPharmacyProfile).mockResolvedValue(profile);
  vi.mocked(getPharmacyVerificationState).mockResolvedValue(approvedState);
  vi.mocked(updatePharmacyProfile).mockResolvedValue({ updated: true });
  vi.mocked(submitPharmacyVerification).mockResolvedValue({
    verificationId: '44444444-4444-4444-8444-444444444444',
  });
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe('PharmacyProfileWorkspace', () => {
  it('renders the safe profile and current verification state without internal review fields', async () => {
    const stateWithInternalFields = {
      ...approvedState,
      current: {
        ...approvedState.current!,
        verificationNotes: 'internal-only note',
        verifiedBy: 'platform-reviewer',
        governmentIdReference: 'SECRET-REF',
        licenseNumber: 'SECRET-LICENSE',
      },
    } as PharmacyVerificationState;
    vi.mocked(getPharmacyVerificationState).mockResolvedValue(stateWithInternalFields);

    renderWorkspace();

    await waitFor(() => expect(screen.getByDisplayValue('City Pharmacy')).toBeInTheDocument());
    expect(screen.getByText('Approved')).toBeInTheDocument();
    expect(
      screen.getByText(
        'AIM verification records the platform review state for this pharmacy. It is not a government certification.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('internal-only note')).not.toBeInTheDocument();
    expect(screen.queryByText('platform-reviewer')).not.toBeInTheDocument();
    expect(screen.queryByText('SECRET-REF')).not.toBeInTheDocument();
    expect(screen.queryByText('SECRET-LICENSE')).not.toBeInTheDocument();
  });

  it('links only server-controlled official verification authority sites', async () => {
    renderWorkspace();

    await waitFor(() =>
      expect(screen.getByText('Official verification sources')).toBeInTheDocument(),
    );

    const drugsControl = screen.getByRole('link', {
      name: 'Open official source',
    });
    expect(drugsControl).toHaveAttribute('target', '_blank');
    expect(
      screen.getByText('Tamil Nadu Drugs Control — drug sales licensing'),
    ).toBeInTheDocument();
    expect(screen.getByText('Tamil Nadu Pharmacy Council')).toBeInTheDocument();

    const links = screen.getAllByRole('link', { name: 'Open official source' });
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      'https://drugscontrol.tn.gov.in/sales_services.html',
      'https://tnpc.ac.in/',
    ]);
  });

  it('saves only the reviewed pharmacy profile fields', async () => {
    renderWorkspace();
    await waitFor(() => expect(screen.getByDisplayValue('City Pharmacy')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Business name'), {
      target: { value: 'City Pharmacy Central' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));

    await waitFor(() =>
      expect(updatePharmacyProfile).toHaveBeenCalledWith(
        pharmacyId,
        expect.objectContaining({
          businessName: 'City Pharmacy Central',
          latitude: 13.0827,
          longitude: 80.2707,
        }),
      ),
    );
  });

  it('submits initial verification as an opaque evidence reference without document upload', async () => {
    vi.mocked(getPharmacyVerificationState).mockResolvedValue({
      current: null,
      openSubmission: null,
      verificationSources: officialSources,
      jurisdictionReviewRequired: false,
      jurisdictionNote: null,
    });

    renderWorkspace();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Submit verification' })).toBeInTheDocument(),
    );

    fireEvent.change(screen.getByLabelText('License number'), {
      target: { value: 'TN-PHARM-001' },
    });
    fireEvent.change(screen.getByLabelText('License expiry date'), {
      target: { value: '2035-01-01' },
    });
    fireEvent.change(screen.getByLabelText('Business registration number'), {
      target: { value: 'REG-001' },
    });
    fireEvent.change(screen.getByLabelText(/^Government ID evidence reference/), {
      target: { value: 'GOV-REF-001' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit verification' }));

    await waitFor(() =>
      expect(submitPharmacyVerification).toHaveBeenCalledWith(pharmacyId, {
        licenseNumber: 'TN-PHARM-001',
        licenseExpiryDate: '2035-01-01T00:00:00.000Z',
        businessRegistrationNumber: 'REG-001',
        governmentIdReference: 'GOV-REF-001',
      }),
    );
    expect(
      screen.getByText(
        /Do not paste a URL, file path, document contents, or upload a document here/,
      ),
    ).toBeInTheDocument();
  });

  it('keeps an approved current verification distinct from an open renewal', async () => {
    vi.mocked(getPharmacyVerificationState).mockResolvedValue({
      current: approvedState.current,
      openSubmission: {
        verificationId: '55555555-5555-4555-8555-555555555555',
        status: 'UNDER_REVIEW',
        submittedAt: '2026-09-24T10:00:00.000Z',
        licenseExpiryDate: '2028-09-01T00:00:00.000Z',
        applicantMessage: null,
        version: 1,
      },
      verificationSources: officialSources,
      jurisdictionReviewRequired: false,
      jurisdictionNote: null,
    });

    renderWorkspace();

    await waitFor(() => expect(screen.getByText('Open renewal')).toBeInTheDocument());
    expect(screen.getByText('Current state')).toBeInTheDocument();
    expect(screen.getByText('Under review')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Submit renewal' })).not.toBeInTheDocument();
    expect(
      screen.getByText(
        'A verification submission is already open. Wait for its review before submitting again.',
      ),
    ).toBeInTheDocument();
  });

  it('shows an explicit state when no pharmacy is assigned', async () => {
    vi.mocked(getAssignedProviders).mockResolvedValue([]);

    renderWorkspace();

    await waitFor(() => expect(screen.getByText('No assigned pharmacy')).toBeInTheDocument());
    expect(getPharmacyProfile).not.toHaveBeenCalled();
    expect(getPharmacyVerificationState).not.toHaveBeenCalled();
  });
});
