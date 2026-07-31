// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';

const validRole = {
  name: 'PHARMACY_MANAGER',
  description: 'Manages pharmacy access',
  permissionKeys: ['authorization.roles.read'],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('custom role mutation boundary', () => {
  it('rejects requests without a matching browser origin before using credentials', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await POST(createRequest(validRole, { origin: 'https://attacker.example' }));

    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('requires an access credential after the origin check', async () => {
    const response = await POST(createRequest(validRole));

    expect(response.status).toBe(401);
  });

  it('forwards a bounded accepted role and validates the created role response', async () => {
    const created = {
      id: 'role-id',
      ...validRole,
      type: 'TENANT',
      version: 1,
      assignmentCount: 0,
    };
    const fetchMock = vi.fn().mockResolvedValue(Response.json(created, { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await POST(
      createRequest(validRole, { cookie: 'medsphere_access=access-secret' }),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual(created);
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer access-secret');
  });

  it('preserves a safe backend conflict message', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json(
            { error: { code: 'ConflictException', message: 'Role already exists' } },
            { status: 409 },
          ),
        ),
    );

    const response = await POST(
      createRequest(validRole, { cookie: 'medsphere_access=access-secret' }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ message: 'Role already exists' });
  });
});

function createRequest(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost/api/authorization/roles', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost', ...headers },
    body: JSON.stringify(body),
  });
}
