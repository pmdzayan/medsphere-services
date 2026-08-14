// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';

const providerId = '7f51a0f3-3bd1-45d7-85f3-b8b725969df9';
const batchId = '73a97ec4-84f8-4a85-a493-b8d6feb84a27';
const context = { params: Promise.resolve({ providerId, batchId }) };
const command = {
  expectedVersion: 4,
  quantity: 2,
  idempotencyKey: 'damage-command-1',
  reason: 'Two sealed packs were physically damaged during handling.',
};
const receipt = {
  providerId,
  inventoryId: 'f63f50dd-49b0-4a77-bc04-f7d00db58dd5',
  productId: '8b4d574f-48c6-4231-8851-e65edc9f9d42',
  batchId,
  movementId: '52f2d7a4-0948-49c4-a0a8-afbf88503a5c',
  quantity: 2,
  onHandBefore: 20,
  onHandAfter: 18,
  resultingBatchVersion: 5,
  occurredAt: '2026-08-14T02:00:00.000Z',
  replayed: false,
};

afterEach(() => vi.unstubAllGlobals());

describe('damaged-stock mutation BFF', () => {
  it('forwards only the accepted completed write-off and preserves private no-store', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(receipt));
    vi.stubGlobal('fetch', fetchMock);
    const response = await POST(request(command), context);

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(`/providers/${providerId}/batches/${batchId}/damage`);
    expect(init).toMatchObject({ method: 'POST', body: JSON.stringify(command) });
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer access-secret');
  });

  it('rejects cross-origin, malformed, and over-broad commands before forwarding', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect((await POST(request(command, 'https://attacker.example'), context)).status).toBe(403);
    expect((await POST(request({ ...command, tenantId: 'attacker' }), context)).status).toBe(400);
    expect((await POST(request({ ...command, quantity: 0 }), context)).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects non-conserving receipts and preserves stock conflicts', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ ...receipt, onHandAfter: 19 })),
    );
    expect((await POST(request(command), context)).status).toBe(502);

    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(Response.json({ message: 'Batch version conflict' }, { status: 409 })),
    );
    expect((await POST(request(command), context)).status).toBe(409);
  });
});

function request(body: unknown, origin = 'http://localhost') {
  return new NextRequest(
    `http://localhost/api/inventory/providers/${providerId}/batches/${batchId}/damage`,
    {
      method: 'POST',
      headers: {
        origin,
        cookie: 'medsphere_access=access-secret',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    },
  );
}
