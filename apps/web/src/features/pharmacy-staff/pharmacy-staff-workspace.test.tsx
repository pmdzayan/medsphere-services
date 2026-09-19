import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '@/components/language-provider';
import {
  assignPharmacyStaff,
  getAssignedProviders,
  getAuthorizationCatalogue,
  getMembershipCatalogue,
  getPharmacyStaff,
  revokePharmacyStaffAccess,
} from '@/lib/api-client';
import { AUTHORIZATION_PERMISSIONS } from '@/lib/authorization-contract';
import { PharmacyStaffWorkspace } from './pharmacy-staff-workspace';

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return {
    ...actual,
    assignPharmacyStaff: vi.fn(),
    getAssignedProviders: vi.fn(),
    getAuthorizationCatalogue: vi.fn(),
    getMembershipCatalogue: vi.fn(),
    getPharmacyStaff: vi.fn(),
    revokePharmacyStaffAccess: vi.fn(),
  };
});

const pharmacyId = '11111111-1111-4111-8111-111111111111';
const managerMembershipId = '22222222-2222-4222-8222-222222222222';
const staffMembershipId = '33333333-3333-4333-8333-333333333333';
const candidateMembershipId = '44444444-4444-4444-8444-444444444444';
const roleId = '55555555-5555-4555-8555-555555555555';

const pharmacy = {
  membershipId: managerMembershipId,
  providerId: pharmacyId,
  businessName: 'City Pharmacy',
  providerType: 'PHARMACY' as const,
  isActive: true,
};

const staffMember = {
  membershipId: staffMembershipId,
  firstName: 'Asha',
  lastName: 'Rao',
  email: 'asha@example.test',
  status: 'ACTIVE' as const,
  roles: [{ id: roleId, name: 'Staff Pharmacist' }],
};

const candidate = {
  id: candidateMembershipId,
  userId: '66666666-6666-4666-8666-666666666666',
  firstName: 'Mina',
  lastName: 'Patel',
  email: 'mina@example.test',
  status: 'ACTIVE' as const,
  roles: [],
};

const catalogueWithManage = {
  roles: [],
  permissions: [],
  total: 0,
  effectivePermissions: [
    AUTHORIZATION_PERMISSIONS.providerAccessManage,
    AUTHORIZATION_PERMISSIONS.assignmentsRead,
  ],
};

function staffPage(data = [staffMember]) {
  return { data, total: data.length, limit: 50, offset: 0 };
}

function renderWorkspace() {
  return render(
    <LanguageProvider>
      <PharmacyStaffWorkspace />
    </LanguageProvider>,
  );
}

beforeEach(() => {
  vi.mocked(getAssignedProviders).mockResolvedValue([pharmacy]);
  vi.mocked(getAuthorizationCatalogue).mockResolvedValue(catalogueWithManage);
  vi.mocked(getMembershipCatalogue).mockResolvedValue({
    data: [candidate],
    total: 1,
    limit: 100,
    offset: 0,
  });
  vi.mocked(getPharmacyStaff).mockResolvedValue(staffPage());
  vi.mocked(assignPharmacyStaff).mockResolvedValue(undefined);
  vi.mocked(revokePharmacyStaffAccess).mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe('PharmacyStaffWorkspace', () => {
  it('renders the assigned pharmacy roster and organization roles', async () => {
    renderWorkspace();

    await waitFor(() => expect(screen.getByText('asha@example.test')).toBeInTheDocument());
    expect(screen.getByText('Staff Pharmacist')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Team Access' })).toHaveAttribute('href', '/team');
  });

  it('shows an explicit state when no pharmacy is assigned', async () => {
    vi.mocked(getAssignedProviders).mockResolvedValue([]);

    renderWorkspace();

    await waitFor(() => expect(screen.getByText('No assigned pharmacy')).toBeInTheDocument());
    expect(getPharmacyStaff).not.toHaveBeenCalled();
  });

  it('shows a provider-loading failure instead of an empty roster', async () => {
    vi.mocked(getAssignedProviders).mockRejectedValue(new Error('offline'));

    renderWorkspace();

    await waitFor(() =>
      expect(screen.getByText('Unable to load your assigned pharmacies.')).toBeInTheDocument(),
    );
  });

  it('hides assignment and revoke actions without provider-access management permission', async () => {
    vi.mocked(getAuthorizationCatalogue).mockResolvedValue({
      ...catalogueWithManage,
      effectivePermissions: [AUTHORIZATION_PERMISSIONS.assignmentsRead],
    });

    renderWorkspace();

    await waitFor(() => expect(screen.getByText('asha@example.test')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Assign member' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Revoke access' })).not.toBeInTheDocument();
  });

  it('assigns an existing active organization member', async () => {
    renderWorkspace();
    await waitFor(() => expect(screen.getByText('asha@example.test')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Assign member' }));
    fireEvent.change(screen.getByLabelText('Organization member'), {
      target: { value: candidateMembershipId },
    });
    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'Assign organization member' })).getByRole(
        'button',
        { name: 'Assign member' },
      ),
    );

    await waitFor(() =>
      expect(assignPharmacyStaff).toHaveBeenCalledWith(pharmacyId, candidateMembershipId),
    );
  });

  it('revokes only the selected member pharmacy access after confirmation', async () => {
    renderWorkspace();
    await waitFor(() => expect(screen.getByText('asha@example.test')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Revoke access' }));
    expect(screen.getByRole('dialog', { name: 'Revoke pharmacy access' })).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Revoke access' })[1]);

    await waitFor(() =>
      expect(revokePharmacyStaffAccess).toHaveBeenCalledWith(pharmacyId, staffMembershipId),
    );
  });
});
