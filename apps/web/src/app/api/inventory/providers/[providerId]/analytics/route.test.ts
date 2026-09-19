// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';

afterEach(() => vi.unstubAllGlobals());

const PROVIDER_ID = '33333333-3333-4333-8333-333333333333';

const VALID_ATTENTION_ITEM = {
  id: '11111111-1111-4111-8111-111111111111',
  type: 'NEAR_EXPIRY_BATCH',
  severity: 'ATTENTION',
  providerId: PROVIDER_ID,
  sourceResourceType: 'Batch',
  sourceResourceId: '22222222-2222-4222-8222-222222222222',
  occurredAt: null,
  dueAt: new Date('2027-01-10T00:00:00.000Z').toISOString(),
};

const VALID_RESPONSE = {
  providerId: PROVIDER_ID,
  generatedAt: new Date('2027-01-01T00:00:00.000Z').toISOString(),
  inventory: {
    distinctProductCount: 10,
    activeBatchCount: 20,
    availableQuantity: 500,
    heldQuantity: 50,
    unavailableProductCount: 1,
    lowStockProductCount: 2,
  },
  reservations: {
    pending: 1,
    confirmed: 2,
    ready: 3,
    completed: 4,
    cancelled: 5,
    expired: 6,
    activeCount: 6,
    heldQuantity: 30,
  },
  expiry: { expiredBatchCount: 1, nearExpiryBatchCount: 2, horizonDays: 30 },
  quality: { quarantinedBatchCount: 1, damagedMovementCount: 3 },
  transfers: { completedCount: 5 },
  attentionItems: [VALID_ATTENTION_ITEM],
};

describe('inventory analytics BFF boundary (candidate Task 0038)', () => {
  // --- Valid requests ---

  it('a valid assigned-provider UUID with no horizon forwards to backend default behavior', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(VALID_RESPONSE));
    vi.stubGlobal('fetch', fetchMock);
    const response = await GET(request(PROVIDER_ID, ''), context(PROVIDER_ID));
    expect(response.status).toBe(200);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).not.toContain('nearExpiryHorizonDays');
  });

  it.each([7, 30, 60, 90])('accepts horizon %i and forwards it exactly', async (horizon) => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        ...VALID_RESPONSE,
        expiry: { ...VALID_RESPONSE.expiry, horizonDays: horizon },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const response = await GET(
      request(PROVIDER_ID, `nearExpiryHorizonDays=${horizon}`),
      context(PROVIDER_ID),
    );
    expect(response.status).toBe(200);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain(`nearExpiryHorizonDays=${horizon}`);
  });

  it('forwards the session via the accepted server-side authorization header mechanism', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(VALID_RESPONSE));
    vi.stubGlobal('fetch', fetchMock);
    await GET(request(PROVIDER_ID, ''), context(PROVIDER_ID));
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer access-secret');
  });

  it('a successful response uses Cache-Control: private, no-store', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(VALID_RESPONSE)));
    const response = await GET(request(PROVIDER_ID, ''), context(PROVIDER_ID));
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });

  it('an error response also uses Cache-Control: private, no-store', async () => {
    const response = await GET(request('not-a-uuid', ''), context('not-a-uuid'));
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });

  // --- Request validation failures (rejected before upstream call) ---

  it('rejects a malformed provider UUID before contacting upstream', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const response = await GET(request('not-a-uuid', ''), context('not-a-uuid'));
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects an unknown query key before contacting upstream', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const response = await GET(request(PROVIDER_ID, 'tenantId=attacker'), context(PROVIDER_ID));
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a duplicated horizon key before contacting upstream', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const response = await GET(
      request(PROVIDER_ID, 'nearExpiryHorizonDays=7&nearExpiryHorizonDays=30'),
      context(PROVIDER_ID),
    );
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['0', '-1', '1', '365', '7.0', '07', '30.5', ' 30', '30 ', ''])(
    'rejects an invalid horizon value (%s) before contacting upstream, never silently normalized',
    async (horizon) => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      const response = await GET(
        request(PROVIDER_ID, `nearExpiryHorizonDays=${encodeURIComponent(horizon)}`),
        context(PROVIDER_ID),
      );
      expect(response.status).toBe(400);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('rejects repeated unknown query parameters before contacting upstream', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const response = await GET(request(PROVIDER_ID, 'foo=1&foo=2&bar=3'), context(PROVIDER_ID));
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // --- Authentication / upstream ---

  it('rejects a request with no session cookie before contacting upstream', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const response = await GET(
      new NextRequest(`http://localhost/api/inventory/providers/${PROVIDER_ID}/analytics`),
      context(PROVIDER_ID),
    );
    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([400, 401, 403, 404])(
    'preserves an upstream %i as the same bounded status',
    async (status) => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nope', { status })));
      const response = await GET(request(PROVIDER_ID, ''), context(PROVIDER_ID));
      expect(response.status).toBe(status);
    },
  );

  it('maps an upstream 500 to 502', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('boom', { status: 500 })));
    const response = await GET(request(PROVIDER_ID, ''), context(PROVIDER_ID));
    expect(response.status).toBe(502);
  });

  it('reports a genuine network failure as 503', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network unreachable')));
    const response = await GET(request(PROVIDER_ID, ''), context(PROVIDER_ID));
    expect(response.status).toBe(503);
  });

  it('rejects malformed (non-JSON) upstream data with 502', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('not json{{{', { status: 200 })));
    const response = await GET(request(PROVIDER_ID, ''), context(PROVIDER_ID));
    expect(response.status).toBe(502);
  });

  it('never exposes internal error details (Nest/Prisma/SQL/stack traces/tokens) in the bounded error body', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            'PrismaClientKnownRequestError: SELECT * FROM "Batch" WHERE token=abc123 at line 42',
            { status: 500 },
          ),
        ),
    );
    const response = await GET(request(PROVIDER_ID, ''), context(PROVIDER_ID));
    const body = await response.json();
    expect(body.message).not.toContain('Prisma');
    expect(body.message).not.toContain('SELECT');
    expect(body.message).not.toContain('token=abc123');
  });

  // --- Strict response contract ---

  it('rejects a response missing a top-level field with 502', async () => {
    const withoutInventory: Record<string, unknown> = { ...VALID_RESPONSE };
    delete withoutInventory.inventory;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(withoutInventory)));
    expect((await GET(request(PROVIDER_ID, ''), context(PROVIDER_ID))).status).toBe(502);
  });

  it('rejects a response with an extra top-level field with 502', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ ...VALID_RESPONSE, extra: 'leak' })),
    );
    expect((await GET(request(PROVIDER_ID, ''), context(PROVIDER_ID))).status).toBe(502);
  });

  it('rejects a response missing a nested field with 502', async () => {
    const withoutActiveCount: Record<string, unknown> = { ...VALID_RESPONSE.reservations };
    delete withoutActiveCount.activeCount;
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(Response.json({ ...VALID_RESPONSE, reservations: withoutActiveCount })),
    );
    expect((await GET(request(PROVIDER_ID, ''), context(PROVIDER_ID))).status).toBe(502);
  });

  it('rejects a response with an extra nested field with 502', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          ...VALID_RESPONSE,
          quality: { ...VALID_RESPONSE.quality, extra: 'leak' },
        }),
      ),
    );
    expect((await GET(request(PROVIDER_ID, ''), context(PROVIDER_ID))).status).toBe(502);
  });

  it('rejects a response where a nested object is the wrong type', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ ...VALID_RESPONSE, inventory: 'not-an-object' })),
    );
    expect((await GET(request(PROVIDER_ID, ''), context(PROVIDER_ID))).status).toBe(502);
  });

  it('rejects a negative count with 502', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          ...VALID_RESPONSE,
          inventory: { ...VALID_RESPONSE.inventory, availableQuantity: -1 },
        }),
      ),
    );
    expect((await GET(request(PROVIDER_ID, ''), context(PROVIDER_ID))).status).toBe(502);
  });

  it('rejects a fractional count with 502', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          ...VALID_RESPONSE,
          inventory: { ...VALID_RESPONSE.inventory, availableQuantity: 1.5 },
        }),
      ),
    );
    expect((await GET(request(PROVIDER_ID, ''), context(PROVIDER_ID))).status).toBe(502);
  });

  it('rejects Infinity with 502', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          ...VALID_RESPONSE,
          inventory: { ...VALID_RESPONSE.inventory, availableQuantity: Infinity },
        }),
      ),
    );
    expect((await GET(request(PROVIDER_ID, ''), context(PROVIDER_ID))).status).toBe(502);
  });

  it('rejects an unsafe integer with 502', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          ...VALID_RESPONSE,
          inventory: {
            ...VALID_RESPONSE.inventory,
            availableQuantity: Number.MAX_SAFE_INTEGER + 1,
          },
        }),
      ),
    );
    expect((await GET(request(PROVIDER_ID, ''), context(PROVIDER_ID))).status).toBe(502);
  });

  it('accepts exactly Number.MAX_SAFE_INTEGER where the contract genuinely allows it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          ...VALID_RESPONSE,
          inventory: { ...VALID_RESPONSE.inventory, availableQuantity: Number.MAX_SAFE_INTEGER },
        }),
      ),
    );
    expect((await GET(request(PROVIDER_ID, ''), context(PROVIDER_ID))).status).toBe(200);
  });

  it('accepts zero everywhere it is a valid count', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          ...VALID_RESPONSE,
          inventory: {
            distinctProductCount: 0,
            activeBatchCount: 0,
            availableQuantity: 0,
            heldQuantity: 0,
            unavailableProductCount: 0,
            lowStockProductCount: 0,
          },
          attentionItems: [],
        }),
      ),
    );
    expect((await GET(request(PROVIDER_ID, ''), context(PROVIDER_ID))).status).toBe(200);
  });

  it('rejects a numeric string count with 502', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          ...VALID_RESPONSE,
          inventory: { ...VALID_RESPONSE.inventory, availableQuantity: '500' },
        }),
      ),
    );
    expect((await GET(request(PROVIDER_ID, ''), context(PROVIDER_ID))).status).toBe(502);
  });

  it('rejects an invalid provider UUID in the response body with 502', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ ...VALID_RESPONSE, providerId: 'not-a-uuid' })),
    );
    expect((await GET(request(PROVIDER_ID, ''), context(PROVIDER_ID))).status).toBe(502);
  });

  it('rejects an invalid generatedAt with 502', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ ...VALID_RESPONSE, generatedAt: 'not-a-date' })),
    );
    expect((await GET(request(PROVIDER_ID, ''), context(PROVIDER_ID))).status).toBe(502);
  });

  it('rejects an invalid attention item UUID with 502', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          ...VALID_RESPONSE,
          attentionItems: [{ ...VALID_ATTENTION_ITEM, id: 'not-a-uuid' }],
        }),
      ),
    );
    expect((await GET(request(PROVIDER_ID, ''), context(PROVIDER_ID))).status).toBe(502);
  });

  it('rejects an invalid attention timestamp with 502', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          ...VALID_RESPONSE,
          attentionItems: [{ ...VALID_ATTENTION_ITEM, dueAt: 'not-a-date' }],
        }),
      ),
    );
    expect((await GET(request(PROVIDER_ID, ''), context(PROVIDER_ID))).status).toBe(502);
  });

  it('rejects an invalid/unexpected attention type with 502', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          ...VALID_RESPONSE,
          attentionItems: [{ ...VALID_ATTENTION_ITEM, type: 'EXPIRED_BATCH' }],
        }),
      ),
    );
    expect((await GET(request(PROVIDER_ID, ''), context(PROVIDER_ID))).status).toBe(502);
  });

  it('rejects an invalid/unexpected severity with 502', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          ...VALID_RESPONSE,
          attentionItems: [{ ...VALID_ATTENTION_ITEM, severity: 'URGENT' }],
        }),
      ),
    );
    expect((await GET(request(PROVIDER_ID, ''), context(PROVIDER_ID))).status).toBe(502);
  });

  it('rejects a response with 51 attention items with 502', async () => {
    const items = Array.from({ length: 51 }, (_, i) => ({
      ...VALID_ATTENTION_ITEM,
      id: `11111111-1111-4111-8111-${String(i).padStart(12, '0')}`,
    }));
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ ...VALID_RESPONSE, attentionItems: items })),
    );
    expect((await GET(request(PROVIDER_ID, ''), context(PROVIDER_ID))).status).toBe(502);
  });

  it('accepts exactly 50 attention items', async () => {
    const items = Array.from({ length: 50 }, (_, i) => ({
      ...VALID_ATTENTION_ITEM,
      id: `11111111-1111-4111-8111-${String(i).padStart(12, '0')}`,
    }));
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ ...VALID_RESPONSE, attentionItems: items })),
    );
    expect((await GET(request(PROVIDER_ID, ''), context(PROVIDER_ID))).status).toBe(200);
  });

  it('rejects a malformed nested attention object with 502', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(Response.json({ ...VALID_RESPONSE, attentionItems: ['not-an-object'] })),
    );
    expect((await GET(request(PROVIDER_ID, ''), context(PROVIDER_ID))).status).toBe(502);
  });

  it('rejects a sourceResourceType other than the exact literal "Batch" with 502', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          ...VALID_RESPONSE,
          attentionItems: [{ ...VALID_ATTENTION_ITEM, sourceResourceType: 'Reservation' }],
        }),
      ),
    );
    expect((await GET(request(PROVIDER_ID, ''), context(PROVIDER_ID))).status).toBe(502);
  });

  it('rejects a non-UUID sourceResourceId with 502', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          ...VALID_RESPONSE,
          attentionItems: [{ ...VALID_ATTENTION_ITEM, sourceResourceId: 'not-a-uuid' }],
        }),
      ),
    );
    expect((await GET(request(PROVIDER_ID, ''), context(PROVIDER_ID))).status).toBe(502);
  });

  it('rejects an attention item with an extra field with 502', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          ...VALID_RESPONSE,
          attentionItems: [{ ...VALID_ATTENTION_ITEM, patientName: 'leak' }],
        }),
      ),
    );
    expect((await GET(request(PROVIDER_ID, ''), context(PROVIDER_ID))).status).toBe(502);
  });
});

function request(providerId: string, query: string): NextRequest {
  return new NextRequest(
    `http://localhost/api/inventory/providers/${providerId}/analytics?${query}`,
    { headers: { cookie: 'medsphere_access=access-secret' } },
  );
}

function context(providerId: string) {
  return { params: Promise.resolve({ providerId }) };
}
