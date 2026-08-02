// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { DELETE, PATCH } from './route';

const roleId = 'db8e5a84-9c31-4cf6-8cf2-1d7627d6f2e4';
const context = { params: Promise.resolve({ roleId }) };
afterEach(() => vi.unstubAllGlobals());

describe('version-safe role mutation BFF', () => {
  it('forwards the strong version precondition on update', async () => {
    const role = {
      id: roleId,
      name: 'MANAGER',
      description: null,
      type: 'TENANT',
      version: 3,
      permissionKeys: [],
      assignmentCount: 0,
    };
    const fetchMock = vi.fn().mockResolvedValue(Response.json(role));
    vi.stubGlobal('fetch', fetchMock);
    const response = await PATCH(
      request('PATCH', { version: 2, name: 'MANAGER', permissionKeys: [] }),
      context,
    );
    expect(response.status).toBe(200);
    expect(new Headers((fetchMock.mock.calls[0]?.[1] as RequestInit).headers).get('if-match')).toBe(
      '"2"',
    );
  });

  it('rejects deletion without a valid version before the upstream call', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const response = await DELETE(request('DELETE', { version: 0 }), context);
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects unexpected mutation fields and over-broad role responses', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const unexpected = await PATCH(
      request('PATCH', { version: 2, name: 'MANAGER', tenantId: 'client-controlled' }),
      context,
    );
    expect(unexpected.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockResolvedValue(
      Response.json({
        id: roleId,
        name: 'MANAGER',
        description: null,
        type: 'TENANT',
        version: 3,
        permissionKeys: [],
        assignmentCount: 0,
        tenantId: 'unexpected',
      }),
    );
    const invalidResponse = await PATCH(request('PATCH', { version: 2, name: 'MANAGER' }), context);
    expect(invalidResponse.status).toBe(502);
  });
});

function request(method: string, body: unknown) {
  return new NextRequest(`http://localhost/api/authorization/roles/${roleId}`, {
    method,
    headers: {
      origin: 'http://localhost',
      cookie: 'medsphere_access=secret',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}
