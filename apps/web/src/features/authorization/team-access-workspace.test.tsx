import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '@/components/language-provider';
import {
  getAuthorizationCatalogue,
  getMembershipCatalogue,
  setRoleAssignment,
  updateMembershipStatus,
} from '@/lib/api-client';
import {
  AUTHORIZATION_PERMISSIONS,
  type AuthorizationCatalogue,
} from '@/lib/authorization-contract';
import { TeamAccessWorkspace } from './team-access-workspace';

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return {
    ...actual,
    createRole: vi.fn(),
    deleteRole: vi.fn(),
    getAuthorizationCatalogue: vi.fn(),
    getMembershipCatalogue: vi.fn(),
    setRoleAssignment: vi.fn(),
    updateMembershipStatus: vi.fn(),
    updateRole: vi.fn(),
  };
});

const role = {
  id: 'role-pharmacy-manager',
  name: 'PHARMACY_MANAGER',
  description: 'Manages pharmacy access',
  type: 'TENANT' as const,
  version: 1,
  permissionKeys: [AUTHORIZATION_PERMISSIONS.rolesRead],
  assignmentCount: 1,
};

const membershipCatalogue = {
  data: [
    {
      id: 'membership-aisha',
      userId: 'user-aisha',
      email: 'aisha@example.com',
      firstName: 'Aisha',
      lastName: 'Zahra',
      status: 'ACTIVE' as const,
      roles: [],
    },
  ],
  total: 1,
  limit: 100,
  offset: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getMembershipCatalogue).mockResolvedValue(membershipCatalogue);
  vi.mocked(setRoleAssignment).mockResolvedValue(undefined);
  vi.mocked(updateMembershipStatus).mockResolvedValue({
    ...membershipCatalogue.data[0],
    status: 'SUSPENDED',
  });
});

afterEach(() => cleanup());

function renderWorkspace(currentMembershipId?: string) {
  return render(
    <LanguageProvider initialLocale="en">
      <TeamAccessWorkspace currentMembershipId={currentMembershipId} />
    </LanguageProvider>,
  );
}

describe('TeamAccessWorkspace permission-aware interactions', () => {
  it('omits mutation and membership controls for a role-registry reader', async () => {
    vi.mocked(getAuthorizationCatalogue).mockResolvedValue(
      catalogueWith([AUTHORIZATION_PERMISSIONS.rolesRead]),
    );

    renderWorkspace();

    expect((await screen.findAllByText(/Pharmacy manager/i))[0]).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create custom role' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Manage/ })).not.toBeInTheDocument();
    expect(screen.queryByText('Team role assignments')).not.toBeInTheDocument();
    expect(getMembershipCatalogue).not.toHaveBeenCalled();
  });

  it('shows only the authorized role lifecycle actions', async () => {
    vi.mocked(getAuthorizationCatalogue).mockResolvedValue(
      catalogueWith([
        AUTHORIZATION_PERMISSIONS.rolesRead,
        AUTHORIZATION_PERMISSIONS.permissionsRead,
        AUTHORIZATION_PERMISSIONS.rolesCreate,
        AUTHORIZATION_PERMISSIONS.rolesDelete,
      ]),
    );

    renderWorkspace();

    fireEvent.click(await screen.findByRole('button', { name: 'Create custom role' }));
    expect(screen.getByRole('heading', { name: 'Create custom role' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close role form' }));

    fireEvent.click(
      within(await screen.findByRole('table')).getByRole('button', { name: /Manage/ }),
    );
    expect(screen.getByRole('button', { name: 'Delete role' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Role name')).toBeDisabled();
  });

  it('allows assignment interaction only when assignment management is effective', async () => {
    vi.mocked(getAuthorizationCatalogue).mockResolvedValue(
      catalogueWith([
        AUTHORIZATION_PERMISSIONS.rolesRead,
        AUTHORIZATION_PERMISSIONS.assignmentsRead,
        AUTHORIZATION_PERMISSIONS.assignmentsManage,
      ]),
    );

    renderWorkspace();

    fireEvent.click(await screen.findByRole('button', { name: /Aisha Zahra/ }));
    const assignment = screen.getByRole('checkbox', { name: /PHARMACY_MANAGER/ });
    fireEvent.click(assignment);

    await waitFor(() =>
      expect(setRoleAssignment).toHaveBeenCalledWith(
        'membership-aisha',
        'role-pharmacy-manager',
        true,
      ),
    );
  });

  it('renders assignment access as read-only without management permission', async () => {
    vi.mocked(getAuthorizationCatalogue).mockResolvedValue(
      catalogueWith([
        AUTHORIZATION_PERMISSIONS.rolesRead,
        AUTHORIZATION_PERMISSIONS.assignmentsRead,
      ]),
    );

    renderWorkspace();

    fireEvent.click(await screen.findByRole('button', { name: /Aisha Zahra/ }));
    expect(screen.getByText('Your current role has read-only assignment access.')).toBeVisible();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(setRoleAssignment).not.toHaveBeenCalled();
  });

  it('shows suspend and revoke controls only with effective membership-management permission', async () => {
    vi.mocked(getAuthorizationCatalogue).mockResolvedValue(
      catalogueWith([
        AUTHORIZATION_PERMISSIONS.rolesRead,
        AUTHORIZATION_PERMISSIONS.assignmentsRead,
        AUTHORIZATION_PERMISSIONS.membershipsManage,
      ]),
    );

    renderWorkspace('membership-current-admin');

    fireEvent.click(await screen.findByRole('button', { name: /Aisha Zahra/ }));

    expect(screen.getByRole('button', { name: 'Suspend access' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Revoke access' })).toBeVisible();
  });

  it('clears a pending revocation confirmation when another member is selected', async () => {
    const secondMember = {
      ...membershipCatalogue.data[0],
      id: 'membership-bilal',
      userId: 'user-bilal',
      email: 'bilal@example.com',
      firstName: 'Bilal',
      lastName: 'Khan',
    };

    vi.mocked(getMembershipCatalogue).mockResolvedValue({
      ...membershipCatalogue,
      data: [membershipCatalogue.data[0], secondMember],
      total: 2,
    });

    vi.mocked(getAuthorizationCatalogue).mockResolvedValue(
      catalogueWith([
        AUTHORIZATION_PERMISSIONS.rolesRead,
        AUTHORIZATION_PERMISSIONS.assignmentsRead,
        AUTHORIZATION_PERMISSIONS.membershipsManage,
      ]),
    );

    renderWorkspace('membership-current-admin');

    fireEvent.click(await screen.findByRole('button', { name: /Aisha Zahra/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Revoke access' }));

    expect(screen.getByText('Revoke staff access')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: /Bilal Khan/ }));

    expect(screen.queryByText('Revoke staff access')).not.toBeInTheDocument();
    expect(updateMembershipStatus).not.toHaveBeenCalled();
  });

  it('fails closed when current membership identity is unavailable', async () => {
    vi.mocked(getAuthorizationCatalogue).mockResolvedValue(
      catalogueWith([
        AUTHORIZATION_PERMISSIONS.rolesRead,
        AUTHORIZATION_PERMISSIONS.assignmentsRead,
        AUTHORIZATION_PERMISSIONS.membershipsManage,
      ]),
    );

    renderWorkspace();

    fireEvent.click(await screen.findByRole('button', { name: /Aisha Zahra/ }));

    expect(screen.queryByRole('button', { name: 'Suspend access' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Revoke access' })).not.toBeInTheDocument();
  });

  it('hides membership-status controls without membership-management permission', async () => {
    vi.mocked(getAuthorizationCatalogue).mockResolvedValue(
      catalogueWith([
        AUTHORIZATION_PERMISSIONS.rolesRead,
        AUTHORIZATION_PERMISSIONS.assignmentsRead,
        AUTHORIZATION_PERMISSIONS.assignmentsManage,
      ]),
    );

    renderWorkspace('membership-current-admin');

    fireEvent.click(await screen.findByRole('button', { name: /Aisha Zahra/ }));

    expect(screen.queryByRole('button', { name: 'Suspend access' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Revoke access' })).not.toBeInTheDocument();
  });

  it('does not expose self-suspension or self-revocation controls', async () => {
    vi.mocked(getAuthorizationCatalogue).mockResolvedValue(
      catalogueWith([
        AUTHORIZATION_PERMISSIONS.rolesRead,
        AUTHORIZATION_PERMISSIONS.assignmentsRead,
        AUTHORIZATION_PERMISSIONS.membershipsManage,
      ]),
    );

    renderWorkspace('membership-aisha');

    fireEvent.click(await screen.findByRole('button', { name: /Aisha Zahra/ }));

    expect(screen.queryByRole('button', { name: 'Suspend access' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Revoke access' })).not.toBeInTheDocument();
  });

  it('does not expose active revocation controls for a suspended membership', async () => {
    vi.mocked(getMembershipCatalogue).mockResolvedValue({
      ...membershipCatalogue,
      data: [
        {
          ...membershipCatalogue.data[0],
          status: 'SUSPENDED',
        },
      ],
    });
    vi.mocked(getAuthorizationCatalogue).mockResolvedValue(
      catalogueWith([
        AUTHORIZATION_PERMISSIONS.rolesRead,
        AUTHORIZATION_PERMISSIONS.assignmentsRead,
        AUTHORIZATION_PERMISSIONS.membershipsManage,
      ]),
    );

    renderWorkspace('membership-current-admin');

    fireEvent.click(await screen.findByRole('button', { name: /Aisha Zahra/ }));

    expect(screen.queryByRole('button', { name: 'Suspend access' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Revoke access' })).not.toBeInTheDocument();
  });

  it('does not expose active revocation controls for a revoked membership', async () => {
    vi.mocked(getMembershipCatalogue).mockResolvedValue({
      ...membershipCatalogue,
      data: [
        {
          ...membershipCatalogue.data[0],
          status: 'REVOKED',
        },
      ],
    });
    vi.mocked(getAuthorizationCatalogue).mockResolvedValue(
      catalogueWith([
        AUTHORIZATION_PERMISSIONS.rolesRead,
        AUTHORIZATION_PERMISSIONS.assignmentsRead,
        AUTHORIZATION_PERMISSIONS.membershipsManage,
      ]),
    );

    renderWorkspace('membership-current-admin');

    fireEvent.click(await screen.findByRole('button', { name: /Aisha Zahra/ }));

    expect(screen.queryByRole('button', { name: 'Suspend access' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Revoke access' })).not.toBeInTheDocument();
  });

  it('removes an open mutation form when refreshed permissions revoke access', async () => {
    vi.mocked(getAuthorizationCatalogue)
      .mockResolvedValueOnce(
        catalogueWith([
          AUTHORIZATION_PERMISSIONS.rolesRead,
          AUTHORIZATION_PERMISSIONS.permissionsRead,
          AUTHORIZATION_PERMISSIONS.rolesCreate,
        ]),
      )
      .mockResolvedValueOnce(catalogueWith([AUTHORIZATION_PERMISSIONS.rolesRead]));

    renderWorkspace();

    fireEvent.click(await screen.findByRole('button', { name: 'Create custom role' }));
    expect(screen.getByRole('heading', { name: 'Create custom role' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Create custom role' })).not.toBeInTheDocument(),
    );
    expect(screen.queryByRole('button', { name: 'Create custom role' })).not.toBeInTheDocument();
  });
});

function catalogueWith(
  effectivePermissions: AuthorizationCatalogue['effectivePermissions'],
): AuthorizationCatalogue {
  return {
    roles: [role],
    permissions: [
      {
        id: 'permission-roles-read',
        name: AUTHORIZATION_PERMISSIONS.rolesRead,
        description: 'Read tenant roles',
      },
    ],
    total: 1,
    effectivePermissions,
  };
}
