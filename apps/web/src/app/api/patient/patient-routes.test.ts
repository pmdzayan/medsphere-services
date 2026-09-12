// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as search } from './medicine-discovery/search/route';
import { GET as listReservations, POST as createReservation } from './medicine-reservations/route';
import { GET as getReservation } from './medicine-reservations/[reservationId]/route';
import { POST as cancelReservation } from './medicine-reservations/[reservationId]/cancel/route';
import { POST as requestLiveAvailability } from '../public/medicine-discovery/providers/[providerId]/products/[productId]/availability-requests/route';
import { GET as getLiveAvailability } from '../public/medicine-discovery/availability-requests/[requestId]/route';

const uuid = (suffix: string) => `10000000-0000-4000-8000-${suffix.padStart(12, '0')}`;

const searchResult = {
  productId: uuid('1'),
  providerId: uuid('2'),
  providerName: 'Central Pharmacy',
  providerCity: 'Bengaluru',
  providerState: 'Karnataka',
  name: 'Paracetamol',
  genericName: 'Paracetamol',
  brand: 'AIM Test',
  strength: '500 mg',
  dosageForm: 'TABLET',
  requiresPrescription: false,
  availability: 'AVAILABLE',
  confirmationSource: 'PHARMACY_CONFIRMED',
  confirmedAt: '2026-09-12T12:00:00.000Z',
  requestId: null,
  requestStatus: 'NONE',
  requestedAt: null,
  expiresAt: null,
  retryAfterAt: null,
  distanceKm: null,
} as const;

const searchResponse = {
  data: [searchResult],
  limit: 20,
  offset: 0,
  radiusKm: null,
  area: { city: 'Bengaluru', state: 'Karnataka' },
};

const reservation = {
  id: uuid('3'),
  status: 'PENDING',
  version: 1,
  expiresAt: '2026-09-12T13:00:00.000Z',
  createdAt: '2026-09-12T12:00:00.000Z',
  cancelledAt: null,
  expiredAt: null,
  providerId: uuid('2'),
  providerName: 'Central Pharmacy',
  providerCity: 'Bengaluru',
  providerState: 'Karnataka',
  items: [
    {
      productId: uuid('1'),
      name: 'Paracetamol',
      genericName: 'Paracetamol',
      brand: 'AIM Test',
      strength: '500 mg',
      dosageForm: 'TABLET',
      quantity: 1,
    },
  ],
  totalQuantity: 1,
} as const;

const createResponse = {
  reservationId: uuid('3'),
  status: 'PENDING',
  version: 1,
  itemCount: 1,
  totalQuantity: 1,
  expiresAt: '2026-09-12T13:00:00.000Z',
  replayed: false,
} as const;

const cancelResponse = {
  reservationId: uuid('3'),
  status: 'CANCELLED',
  version: 2,
  totalQuantity: 1,
  replayed: false,
} as const;

const liveResponse = {
  requestId: uuid('4'),
  requestStatus: 'PENDING',
  requestedAt: '2026-09-12T12:00:00.000Z',
  expiresAt: '2026-09-12T12:10:00.000Z',
  respondedAt: null,
  availabilityState: 'CONFIRMATION_REQUIRED',
  confirmationSource: null,
  confirmedAt: null,
  retryAfterAt: null,
} as const;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Task 0034 patient BFF boundaries', () => {
  it('rejects unsupported/owner-selecting search queries before any upstream call', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await search(
      getRequest(
        `/api/patient/medicine-discovery/search?q=paracetamol&city=Bengaluru&state=Karnataka&userId=${uuid('9')}`,
        true,
      ),
    );

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects radius without precise coordinates and malformed coordinate pairs', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    expect(
      (
        await search(
          getRequest('/api/patient/medicine-discovery/search?q=paracetamol&radiusKm=10', true),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await search(
          getRequest(
            '/api/patient/medicine-discovery/search?q=paracetamol&latitude=12.9&longitude=not-a-number',
            true,
          ),
        )
      ).status,
    ).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps the access token server-side and rejects extra successful search fields', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json(searchResponse))
      .mockResolvedValueOnce(Response.json({ ...searchResponse, tenantId: uuid('8') }));
    vi.stubGlobal('fetch', fetchMock);

    const request = getRequest(
      '/api/patient/medicine-discovery/search?q=paracetamol&city=Bengaluru&state=Karnataka',
      true,
    );
    const ok = await search(request);
    expect(ok.status).toBe(200);
    expect(ok.headers.get('cache-control')).toContain('no-store');
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer access-secret');
    expect(JSON.stringify(await ok.json())).not.toContain('access-secret');

    const invalid = await search(
      getRequest(
        '/api/patient/medicine-discovery/search?q=paracetamol&city=Bengaluru&state=Karnataka',
        true,
      ),
    );
    expect(invalid.status).toBe(502);
  });

  it('rejects reservation owner selectors, cross-origin creation, and oversized list pagination', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const body = {
      providerId: uuid('2'),
      items: [{ productId: uuid('1'), quantity: 1 }],
      idempotencyKey: 'reserve-1',
    };

    expect(
      (
        await createReservation(
          postRequest('/api/patient/medicine-reservations', body, true, 'https://attacker.example'),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await createReservation(
          postRequest(
            '/api/patient/medicine-reservations',
            { ...body, subjectUserId: uuid('9') },
            true,
          ),
        )
      ).status,
    ).toBe(400);
    expect(
      (await listReservations(getRequest('/api/patient/medicine-reservations?limit=26', true)))
        .status,
    ).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('forwards only the validated reservation create body and validates success strictly', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(createResponse));
    vi.stubGlobal('fetch', fetchMock);

    const response = await createReservation(
      postRequest(
        '/api/patient/medicine-reservations',
        {
          providerId: uuid('2'),
          items: [{ productId: uuid('1'), quantity: 1 }],
          idempotencyKey: 'reserve-1',
        },
        true,
      ),
    );

    expect(response.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(`/patient/reservations/providers/${uuid('2')}`);
    expect(JSON.parse(String(init.body))).toEqual({
      items: [{ productId: uuid('1'), quantity: 1 }],
      idempotencyKey: 'reserve-1',
    });
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer access-secret');
  });

  it('fails closed on malformed reservation detail and cancellation responses', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ ...reservation, allocationIds: [uuid('7')] }))
      .mockResolvedValueOnce(Response.json({ ...cancelResponse, subjectUserId: uuid('9') }));
    vi.stubGlobal('fetch', fetchMock);

    const detail = await getReservation(
      getRequest(`/api/patient/medicine-reservations/${uuid('3')}`, true),
      {
        params: Promise.resolve({ reservationId: uuid('3') }),
      },
    );
    expect(detail.status).toBe(502);

    const cancel = await cancelReservation(
      postRequest(
        `/api/patient/medicine-reservations/${uuid('3')}/cancel`,
        { expectedVersion: 1, idempotencyKey: 'cancel-1' },
        true,
      ),
      { params: Promise.resolve({ reservationId: uuid('3') }) },
    );
    expect(cancel.status).toBe(502);
  });

  it('keeps live availability requests payload-free and rejects malformed references', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    expect(
      (
        await requestLiveAvailability(
          postRequest(
            `/api/public/medicine-discovery/providers/${uuid('2')}/products/${uuid('1')}/availability-requests`,
            { patientId: uuid('9') },
            false,
          ),
          { params: Promise.resolve({ providerId: uuid('2'), productId: uuid('1') }) },
        )
      ).status,
    ).toBe(400);

    expect(
      (
        await requestLiveAvailability(
          postRequest(
            '/api/public/medicine-discovery/providers/not-a-uuid/products/not-a-uuid/availability-requests',
            {},
            false,
          ),
          { params: Promise.resolve({ providerId: 'not-a-uuid', productId: 'not-a-uuid' }) },
        )
      ).status,
    ).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('validates live request/status success and never forwards patient identity', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json(liveResponse))
      .mockResolvedValueOnce(Response.json({ ...liveResponse, actorUserId: uuid('9') }));
    vi.stubGlobal('fetch', fetchMock);

    const created = await requestLiveAvailability(
      postRequest(
        `/api/public/medicine-discovery/providers/${uuid('2')}/products/${uuid('1')}/availability-requests`,
        {},
        false,
      ),
      { params: Promise.resolve({ providerId: uuid('2'), productId: uuid('1') }) },
    );
    expect(created.status).toBe(200);
    const [, createInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(createInit.body).toBeUndefined();
    expect(new Headers(createInit.headers).get('authorization')).toBeNull();

    const status = await getLiveAvailability(
      getRequest(`/api/public/medicine-discovery/availability-requests/${uuid('4')}`, false),
      { params: Promise.resolve({ requestId: uuid('4') }) },
    );
    expect(status.status).toBe(502);
  });
});

function getRequest(path: string, authenticated: boolean): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    headers: authenticated ? { cookie: 'medsphere_access=access-secret' } : {},
  });
}

function postRequest(
  path: string,
  body: unknown,
  authenticated: boolean,
  origin = 'http://localhost',
): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin,
      ...(authenticated ? { cookie: 'medsphere_access=access-secret' } : {}),
    },
    body: JSON.stringify(body),
  });
}
