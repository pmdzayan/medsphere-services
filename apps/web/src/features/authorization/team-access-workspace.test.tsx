import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getAuthorizationCatalogue,
  getMembershipCatalogue,
  setRoleAssignment,
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
});

afterEach(() => cleanup());

describe('TeamAccessWorkspace permission-aware interactions', () => {
  it('omits mutation and membership controls for a role-registry reader', async () => {
    vi.mocked(getAuthorizationCatalogue).mockResolvedValue(
      catalogueWith([AUTHORIZATION_PERMISSIONS.rolesRead]),
    );

    render(<TeamAccessWorkspace />);

    expect(await screen.findByText(/Pharmacy manager/i)).toBeInTheDocument();
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

    render(<TeamAccessWorkspace />);

    fireEvent.click(await screen.findByRole('button', { name: 'Create custom role' }));
    expect(screen.getByRole('heading', { name: 'Create custom role' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close role form' }));

    fireEvent.click(screen.getByRole('button', { name: /Manage/ }));
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

    render(<TeamAccessWorkspace />);

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

    render(<TeamAccessWorkspace />);

    fireEvent.click(await screen.findByRole('button', { name: /Aisha Zahra/ }));
    expect(screen.getByText('Your current role has read-only assignment access.')).toBeVisible();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(setRoleAssignment).not.toHaveBeenCalled();
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

    render(<TeamAccessWorkspace />);

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
