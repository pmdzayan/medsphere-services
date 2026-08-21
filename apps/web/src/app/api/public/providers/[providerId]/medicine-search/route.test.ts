// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';

const providerId = '7f51a0f3-3bd1-45d7-85f3-b8b725969df9';
const context = { params: Promise.resolve({ providerId }) };
const searchResponse = {
  data: [
    {
      productId: '8b4d574f-48c6-4231-8851-e65edc9f9d42',
      providerId,
      providerName: 'Fixture Pharmacy',
      providerCity: 'Chennai',
      providerState: 'Tamil Nadu',
      name: 'Paracetamol 500mg',
      genericName: 'Paracetamol',
      brand: 'Fixture Brand',
      strength: '500 mg',
      dosageForm: 'TABLET',
      requiresPrescription: false,
      availability: 'IN_STOCK',
    },
  ],
  limit: 20,
  offset: 0,
};

afterEach(() => vi.unstubAllGlobals());

describe('public medicine search BFF boundary', () => {
  it('forwards the search term without any access credential and preserves no-store', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(searchResponse));
    vi.stubGlobal('fetch', fetchMock);
    const response = await GET(request('q=paracetamol'), context);

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(`/public/providers/${providerId}/medicine-search?q=paracetamol`);
    expect(new Headers(init.headers).get('authorization')).toBeNull();
  });

  it.each([
    ['', 'q='],
    ['&extra=1', 'q=paracetamol&extra=1'],
    ['&limit=1&limit=2', 'q=paracetamol&limit=1&limit=2'],
    ['&limit=0', 'q=paracetamol&limit=0'],
    ['&offset=-1', 'q=paracetamol&offset=-1'],
  ])('rejects invalid or over-broad query before forwarding: %s', async (_label, query) => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect((await GET(request(query), context)).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects an invalid provider id before forwarding', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const badContext = { params: Promise.resolve({ providerId: 'not-a-uuid' }) };
    expect((await GET(request('q=paracetamol'), badContext)).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('propagates a not-found upstream response identically for enumeration safety', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ message: 'Provider not found' }, { status: 404 })),
    );
    const response = await GET(request('q=paracetamol'), context);
    expect(response.status).toBe(404);
  });

  it('rejects an invalid upstream response shape', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ unexpected: true })));
    expect((await GET(request('q=paracetamol'), context)).status).toBe(502);
  });
});

function request(query: string) {
  return new NextRequest(
    `http://localhost/api/public/providers/${providerId}/medicine-search?${query}`,
  );
}
