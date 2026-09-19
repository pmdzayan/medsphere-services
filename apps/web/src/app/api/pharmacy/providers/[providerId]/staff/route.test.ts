// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST } from './route';

const providerId = '11111111-1111-4111-8111-111111111111';
const membershipId = '22222222-2222-4222-8222-222222222222';
const roleId = '33333333-3333-4333-8333-333333333333';
const context = { params: Promise.resolve({ providerId }) };

const staffPage = {
  data: [
    {
      membershipId,
      firstName: 'Asha',
      lastName: 'Rao',
      email: 'asha@example.test',
      status: 'ACTIVE',
      roles: [{ id: roleId, name: 'Staff Pharmacist' }],
    },
  ],
  total: 1,
  limit: 50,
  offset: 0,
};

afterEach(() => vi.unstubAllGlobals());

describe('pharmacy staff boundary', () => {
  it('forwards a bounded list query and validates the response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(staffPage));
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET(request('GET', undefined, '?limit=50&offset=0'), context);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(staffPage);
    expect(fetchMock).toHaveBeenCalledWith(
      `http://localhost:3000/authorization/providers/${providerId}/memberships?limit=50&offset=0`,
      expect.objectContaining({ cache: 'no-store' }),
    );
    expect(response.headers.get('cache-control')).toContain('no-store');
  });

  it('rejects unknown or out-of-range list parameters before calling upstream', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const unknown = await GET(request('GET', undefined, '?tenantId=client-controlled'), context);
    const oversized = await GET(request('GET', undefined, '?limit=101'), context);

    expect(unknown.status).toBe(400);
    expect(oversized.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails closed for an over-broad upstream staff response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          ...staffPage,
          data: [{ ...staffPage.data[0], userId: '44444444-4444-4444-8444-444444444444' }],
        }),
      ),
    );

    const response = await GET(request('GET'), context);

    expect(response.status).toBe(502);
  });

  it('rejects a cross-origin assignment before using credentials', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await POST(
      request('POST', { membershipId }, '', 'https://attacker.example'),
      context,
    );

    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects extra assignment fields before calling upstream', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await POST(
      request('POST', { membershipId, roleId: 'client-controlled' }),
      context,
    );

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses the existing provider-access mutation and validates its identity', async () => {
    const assignment = {
      membershipId,
      providerId,
      businessName: 'City Pharmacy',
      providerType: 'PHARMACY',
      isActive: true,
    };
    const fetchMock = vi.fn().mockResolvedValue(Response.json(assignment));
    vi.stubGlobal('fetch', fetchMock);

    const response = await POST(request('POST', { membershipId }), context);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ assigned: true });
    expect(fetchMock).toHaveBeenCalledWith(
      `http://localhost:3000/authorization/memberships/${membershipId}/provider-access/${providerId}`,
      expect.objectContaining({ method: 'PUT', cache: 'no-store' }),
    );
  });
});

function request(
  method: string,
  body?: unknown,
  query = '',
  origin = 'http://localhost',
): NextRequest {
  return new NextRequest(`http://localhost/api/pharmacy/providers/${providerId}/staff${query}`, {
    method,
    headers: {
      origin,
      cookie: 'medsphere_access=access-secret',
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
