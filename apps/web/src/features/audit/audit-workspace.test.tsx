import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '@/components/language-provider';
import { ApiError, getAuditEvents } from '@/lib/api-client';
import { type AuditEvent } from '@/lib/audit-contract';
import { AuditWorkspace } from './audit-workspace';

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return { ...actual, getAuditEvents: vi.fn() };
});

const deniedEvent: AuditEvent = {
  id: 'f63f50dd-49b0-4a77-bc04-f7d00db58dd5',
  eventType: 'authorization.permission.denied',
  outcome: 'DENIED',
  actorMembershipId: 'fcb65cb7-9071-40eb-ab52-878978d9031c',
  resourceType: null,
  resourceId: null,
  requestId: 'request-1',
  metadata: { requiredPermissions: 'audit.events.read' },
  occurredAt: '2026-07-31T18:00:00.000Z',
};

const roleEvent: AuditEvent = {
  id: '8b4d574f-48c6-4231-8851-e65edc9f9d42',
  eventType: 'authorization.role.created',
  outcome: 'SUCCEEDED',
  actorMembershipId: '7f51a0f3-3bd1-45d7-85f3-b8b725969df9',
  resourceType: 'Role',
  resourceId: 'role-pharmacy-manager',
  requestId: 'request-2',
  metadata: { roleName: 'PHARMACY_MANAGER', roleVersion: 1, permissionCount: 4 },
  occurredAt: '2026-07-31T17:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getAuditEvents).mockResolvedValue({ data: [deniedEvent], nextCursor: null });
});

afterEach(() => cleanup());

function renderWorkspace() {
  return render(
    <LanguageProvider initialLocale="en">
      <AuditWorkspace />
    </LanguageProvider>,
  );
}

describe('AuditWorkspace interactions', () => {
  it('renders live evidence and opens reviewed details', async () => {
    renderWorkspace();

    fireEvent.click(
      within(await screen.findByRole('table')).getByRole('button', {
        name: /View audit event authorization\.permission\.denied details/i,
      }),
    );

    expect(screen.getByLabelText('Audit event details')).toBeVisible();
    expect(screen.getByText('requiredPermissions')).toBeVisible();
    expect(
      screen.getByText('This interface cannot modify or delete audit evidence.'),
    ).toBeVisible();
  });

  it('applies server-side outcome filters', async () => {
    renderWorkspace();
    await screen.findByText('Tenant events');

    fireEvent.change(screen.getByLabelText('Outcome'), { target: { value: 'DENIED' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));

    await waitFor(() =>
      expect(getAuditEvents).toHaveBeenLastCalledWith({ outcome: 'DENIED', limit: 25 }),
    );
  });

  it('loads older cursor pages without duplicating evidence', async () => {
    vi.mocked(getAuditEvents)
      .mockResolvedValueOnce({ data: [deniedEvent], nextCursor: roleEvent.id })
      .mockResolvedValueOnce({ data: [deniedEvent, roleEvent], nextCursor: null });

    renderWorkspace();

    fireEvent.click(await screen.findByRole('button', { name: 'Load older evidence' }));

    const table = await screen.findByRole('table');
    expect(
      await within(table).findByRole('button', {
        name: /View audit event authorization\.role\.created details/i,
      }),
    ).toBeVisible();
    expect(
      within(table).getAllByRole('button', {
        name: /View audit event authorization\.permission\.denied details/i,
      }),
    ).toHaveLength(1);
    expect(getAuditEvents).toHaveBeenLastCalledWith({ limit: 25, cursor: roleEvent.id });
  });

  it('fails closed with a permission-specific access state', async () => {
    vi.mocked(getAuditEvents).mockRejectedValue(new ApiError('Permission denied', 403));

    renderWorkspace();

    expect(
      await screen.findByRole('heading', { name: 'Audit access is not assigned' }),
    ).toBeVisible();
    expect(screen.getByText('audit.events.read')).toBeVisible();
    expect(screen.queryByText('Tenant events')).not.toBeInTheDocument();
  });

  it('rejects incomplete resource filters before making another request', async () => {
    renderWorkspace();
    await screen.findByText('Tenant events');

    fireEvent.change(screen.getByLabelText('Resource type'), { target: { value: 'Role' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Resource type and resource ID must be supplied together.',
    );
    expect(getAuditEvents).toHaveBeenCalledTimes(1);
  });
});
