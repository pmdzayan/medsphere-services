// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { DELETE, PUT } from './route';

const membershipId = '93b31836-6a84-4db9-a935-1c55960c25da';
const roleId = 'db8e5a84-9c31-4cf6-8cf2-1d7627d6f2e4';
const context = { params: Promise.resolve({ membershipId, roleId }) };

afterEach(() => vi.unstubAllGlobals());

describe('role assignment mutation boundary', () => {
  it('rejects cross-origin requests before using credentials', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await PUT(request('PUT', 'https://attacker.example'), context);

    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('validates the exact assignment response and path identity', async () => {
    const assignment = { membershipId, roleId, roleName: 'PHARMACY_MANAGER' };
    const fetchMock = vi.fn().mockResolvedValue(Response.json(assignment));
    vi.stubGlobal('fetch', fetchMock);

    const response = await PUT(request('PUT'), context);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(assignment);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(
      new Headers((fetchMock.mock.calls[0]?.[1] as RequestInit).headers).get('authorization'),
    ).toBe('Bearer access-secret');
  });

  it('fails closed for mismatched or over-broad assignment responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          membershipId,
          roleId: '19a749a2-6d06-4e52-83ec-a16b6d8e4d4a',
          roleName: 'PHARMACY_MANAGER',
          tenantId: 'unexpected',
        }),
      ),
    );

    const response = await PUT(request('PUT'), context);

    expect(response.status).toBe(502);
  });

  it('returns an explicitly non-cacheable empty deletion response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));

    const response = await DELETE(request('DELETE'), context);

    expect(response.status).toBe(204);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
});

function request(method: string, origin = 'http://localhost'): NextRequest {
  return new NextRequest(
    `http://localhost/api/authorization/memberships/${membershipId}/roles/${roleId}`,
    {
      method,
      headers: { origin, cookie: 'medsphere_access=access-secret' },
    },
  );
}
