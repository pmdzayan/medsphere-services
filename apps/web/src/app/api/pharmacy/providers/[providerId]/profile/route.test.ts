// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, PATCH } from './route';

const PROVIDER_ID = '11111111-1111-4111-8111-111111111111';

function createRequest(
  options: {
    method?: string;
    origin?: string;
    cookie?: string;
    body?: unknown;
  } = {},
): NextRequest {
  const headers = new Headers();
  if (options.origin !== undefined) headers.set('origin', options.origin);
  if (options.cookie !== undefined) headers.set('cookie', options.cookie);
  return new NextRequest(`https://app.example.test/api/pharmacy/providers/${PROVIDER_ID}/profile`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
}

const context = { params: Promise.resolve({ providerId: PROVIDER_ID }) };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('GET /api/pharmacy/providers/[providerId]/profile', () => {
  it('rejects a malformed provider id without calling the backend', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const badContext = { params: Promise.resolve({ providerId: 'not-a-uuid' }) };
    const response = await GET(createRequest({ cookie: 'medsphere_access=token' }), badContext);
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a missing session without calling the backend', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const response = await GET(createRequest(), context);
    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('forwards the request to the correct backend path using the authenticated convention and preserves the response', async () => {
    const profile = {
      businessName: 'City Pharmacy',
      ownerName: 'Asha Rao',
      email: 'pharmacy@example.test',
      phone: '+15551234567',
      address: '1 Main St',
      city: 'Springfield',
      state: 'IL',
      country: 'USA',
      postalCode: '62701',
      latitude: 39.78,
      longitude: -89.65,
    };
    const fetchMock = vi.fn().mockResolvedValue(Response.json(profile));
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET(createRequest({ cookie: 'medsphere_access=token' }), context);

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(`/providers/${PROVIDER_ID}/profile`);
    expect((init.headers as Headers).get('authorization')).toBe('Bearer token');
    const body = (await response.json()) as unknown;
    expect(body).toEqual(profile);
  });

  it('returns a safe error without leaking upstream details on backend failure', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        Response.json({ message: 'Internal Prisma error at line 42' }, { status: 500 }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET(createRequest({ cookie: 'medsphere_access=token' }), context);
    expect(response.status).toBe(502);
    const body = (await response.json()) as { message: string };
    expect(body.message).toBe('Internal Prisma error at line 42'.slice(0, 240));
  });
});

describe('PATCH /api/pharmacy/providers/[providerId]/profile', () => {
  it('rejects cross-origin PATCH attempts without calling the backend', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const response = await PATCH(
      createRequest({
        method: 'PATCH',
        origin: 'https://attacker.example',
        cookie: 'medsphere_access=token',
        body: { businessName: 'X' },
      }),
      context,
    );
    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('accepts a valid partial update and forwards only the allowlisted key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ updated: true }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await PATCH(
      createRequest({
        method: 'PATCH',
        origin: 'https://app.example.test',
        cookie: 'medsphere_access=token',
        body: { businessName: 'New Name' },
      }),
      context,
    );

    expect(response.status).toBe(200);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const sentBody = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(sentBody).toEqual({ businessName: 'New Name' });
  });

  it('accepts all allowed keys together and forwards exactly those keys, nothing else', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ updated: true }));
    vi.stubGlobal('fetch', fetchMock);
    const allFields = {
      businessName: 'City Pharmacy',
      ownerName: 'Asha Rao',
      email: 'pharmacy@example.test',
      phone: '+15551234567',
      address: '1 Main St',
      city: 'Springfield',
      state: 'IL',
      country: 'USA',
      postalCode: '62701',
      latitude: 39.78,
      longitude: -89.65,
    };

    const response = await PATCH(
      createRequest({
        method: 'PATCH',
        origin: 'https://app.example.test',
        cookie: 'medsphere_access=token',
        body: allFields,
      }),
      context,
    );

    expect(response.status).toBe(200);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const sentBody = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(sentBody).toEqual(allFields);
    expect(Object.keys(sentBody).sort()).toEqual(Object.keys(allFields).sort());
  });

  it('omitted fields stay omitted rather than becoming null/empty in the outbound body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ updated: true }));
    vi.stubGlobal('fetch', fetchMock);

    await PATCH(
      createRequest({
        method: 'PATCH',
        origin: 'https://app.example.test',
        cookie: 'medsphere_access=token',
        body: { city: 'Springfield' },
      }),
      context,
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const sentBody = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(Object.keys(sentBody)).toEqual(['city']);
    expect('businessName' in sentBody).toBe(false);
    expect('latitude' in sentBody).toBe(false);
  });

  it('rejects an unknown key BEFORE calling the backend', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const response = await PATCH(
      createRequest({
        method: 'PATCH',
        origin: 'https://app.example.test',
        cookie: 'medsphere_access=token',
        body: { businessName: 'X', extraField: 'y' },
      }),
      context,
    );
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects "tenantId" before calling the backend', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const response = await PATCH(
      createRequest({
        method: 'PATCH',
        origin: 'https://app.example.test',
        cookie: 'medsphere_access=token',
        body: { businessName: 'X', tenantId: 'attacker-id' },
      }),
      context,
    );
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects "providerType" before calling the backend', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const response = await PATCH(
      createRequest({
        method: 'PATCH',
        origin: 'https://app.example.test',
        cookie: 'medsphere_access=token',
        body: { businessName: 'X', providerType: 'HOSPITAL' },
      }),
      context,
    );
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects "isVerified" before calling the backend', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const response = await PATCH(
      createRequest({
        method: 'PATCH',
        origin: 'https://app.example.test',
        cookie: 'medsphere_access=token',
        body: { businessName: 'X', isVerified: true },
      }),
      context,
    );
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects "isActive" before calling the backend', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const response = await PATCH(
      createRequest({
        method: 'PATCH',
        origin: 'https://app.example.test',
        cookie: 'medsphere_access=token',
        body: { businessName: 'X', isActive: true },
      }),
      context,
    );
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects "deletedAt" before calling the backend', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const response = await PATCH(
      createRequest({
        method: 'PATCH',
        origin: 'https://app.example.test',
        cookie: 'medsphere_access=token',
        body: { businessName: 'X', deletedAt: null },
      }),
      context,
    );
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects an out-of-range latitude before calling the backend', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const response = await PATCH(
      createRequest({
        method: 'PATCH',
        origin: 'https://app.example.test',
        cookie: 'medsphere_access=token',
        body: { latitude: 95 },
      }),
      context,
    );
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects an out-of-range longitude before calling the backend', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const response = await PATCH(
      createRequest({
        method: 'PATCH',
        origin: 'https://app.example.test',
        cookie: 'medsphere_access=token',
        body: { longitude: 200 },
      }),
      context,
    );
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects wrong primitive types before calling the backend', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const response = await PATCH(
      createRequest({
        method: 'PATCH',
        origin: 'https://app.example.test',
        cookie: 'medsphere_access=token',
        body: { businessName: 12345 },
      }),
      context,
    );
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
