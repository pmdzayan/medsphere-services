// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('authorization catalogue boundary', () => {
  it('requires an authenticated access cookie', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET(new NextRequest('http://localhost/api/authorization/catalogue'));

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('combines validated tenant roles and permissions without exposing credentials', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          permissionKeys: ['authorization.roles.read', 'authorization.permissions.read'],
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          data: [
            {
              id: 'role-id',
              name: 'TENANT_ADMINISTRATOR',
              description: null,
              type: 'SYSTEM',
              version: 1,
              permissionKeys: ['authorization.roles.read'],
              assignmentCount: 1,
            },
          ],
          total: 1,
          limit: 100,
          offset: 0,
        }),
      )
      .mockResolvedValueOnce(
        Response.json([
          {
            id: 'permission-id',
            name: 'authorization.roles.read',
            description: 'Read roles',
          },
        ]),
      );
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET(
      new NextRequest('http://localhost/api/authorization/catalogue', {
        headers: { cookie: 'medsphere_access=access-secret' },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      total: 1,
      effectivePermissions: ['authorization.roles.read', 'authorization.permissions.read'],
    });
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    for (const call of fetchMock.mock.calls) {
      const init = call[1] as RequestInit;
      expect(new Headers(init.headers).get('authorization')).toBe('Bearer access-secret');
    }
  });

  it('does not request catalogues the authenticated membership cannot read', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      Response.json({
        permissionKeys: ['audit.events.read'],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET(
      new NextRequest('http://localhost/api/authorization/catalogue', {
        headers: { cookie: 'medsphere_access=access-secret' },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      roles: [],
      permissions: [],
      total: 0,
      effectivePermissions: ['audit.events.read'],
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed successful upstream data', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          Response.json({
            permissionKeys: ['authorization.roles.read', 'authorization.permissions.read'],
          }),
        )
        .mockResolvedValueOnce(Response.json({ data: [], total: -1 }))
        .mockResolvedValueOnce(Response.json([])),
    );

    const response = await GET(
      new NextRequest('http://localhost/api/authorization/catalogue', {
        headers: { cookie: 'medsphere_access=access-secret' },
      }),
    );

    expect(response.status).toBe(502);
  });

  it('reports a permitted secondary request transport failure as unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(Response.json({ permissionKeys: ['authorization.roles.read'] }))
        .mockRejectedValueOnce(new Error('connection refused')),
    );

    const response = await GET(
      new NextRequest('http://localhost/api/authorization/catalogue', {
        headers: { cookie: 'medsphere_access=access-secret' },
      }),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      message: 'Authorization service is unavailable.',
    });
  });
});
