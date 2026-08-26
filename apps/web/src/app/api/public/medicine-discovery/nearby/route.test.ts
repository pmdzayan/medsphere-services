// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';

const nearbyResponse = {
  data: [
    {
      productId: '8b4d574f-48c6-4231-8851-e65edc9f9d42',
      providerId: '7f51a0f3-3bd1-45d7-85f3-b8b725969df9',
      providerName: 'Fixture Pharmacy',
      providerCity: 'Chennai',
      providerState: 'Tamil Nadu',
      distanceKm: 1.4,
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
  radiusKm: 10,
};

afterEach(() => vi.unstubAllGlobals());

describe('public nearby medicine search BFF boundary', () => {
  it('forwards only the validated nearby-search contract without credentials', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(nearbyResponse));
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET(request('q=paracetamol&latitude=12.9716&longitude=77.5946'));

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];

    expect(url).toContain('/public/medicine-discovery/nearby?');
    expect(url).toContain('q=paracetamol');
    expect(url).toContain('latitude=12.9716');
    expect(url).toContain('longitude=77.5946');
    expect(url).toContain('radiusKm=10');
    expect(url).toContain('limit=20');
    expect(url).toContain('offset=0');

    const headers = new Headers(init.headers);
    expect(headers.get('authorization')).toBeNull();
    expect(headers.get('cookie')).toBeNull();
  });

  it.each([
    ['missing query', 'latitude=12.9716&longitude=77.5946'],
    ['missing latitude', 'q=paracetamol&longitude=77.5946'],
    ['missing longitude', 'q=paracetamol&latitude=12.9716'],
    ['invalid latitude', 'q=paracetamol&latitude=91&longitude=77.5946'],
    ['invalid longitude', 'q=paracetamol&latitude=12.9716&longitude=181'],
    ['invalid radius', 'q=paracetamol&latitude=12.9716&longitude=77.5946&radiusKm=0'],
    ['duplicate query', 'q=paracetamol&q=ibuprofen&latitude=12.9716&longitude=77.5946'],
    ['unsupported query', 'q=paracetamol&latitude=12.9716&longitude=77.5946&extra=1'],
  ])('rejects invalid nearby-search input before forwarding: %s', async (_label, query) => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    expect((await GET(request(query))).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps an upstream transport failure to a bounded 503 response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('private transport detail')));

    const response = await GET(request('q=paracetamol&latitude=12.9716&longitude=77.5946'));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      message: 'Nearby search is unavailable right now.',
    });
  });

  it('rejects an invalid upstream response shape', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ unexpected: true })));

    expect((await GET(request('q=paracetamol&latitude=12.9716&longitude=77.5946'))).status).toBe(
      502,
    );
  });
});

function request(query: string) {
  return new NextRequest(`http://localhost/api/public/medicine-discovery/nearby?${query}`);
}
