// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';

const providerId = '7f51a0f3-3bd1-45d7-85f3-b8b725969df9';
const destinationProviderId = '8b4d574f-48c6-4231-8851-e65edc9f9d42';
const sourceBatchId = '73a97ec4-84f8-4a85-a493-b8d6feb84a27';
const context = { params: Promise.resolve({ providerId }) };
const command = {
  destinationProviderId,
  sourceBatchId,
  expectedSourceVersion: 4,
  quantity: 2,
  idempotencyKey: 'transfer-command-1',
};
const receipt = {
  transferId: '52f2d7a4-0948-49c4-a0a8-afbf88503a5c',
  productId: '8c4d574f-48c6-4231-8851-e65edc9f9d42',
  sourceProviderId: providerId,
  destinationProviderId,
  sourceInventoryId: 'f63f50dd-49b0-4a77-bc04-f7d00db58dd5',
  destinationInventoryId: 'd63f50dd-49b0-4a77-bc04-f7d00db58dd5',
  sourceBatchId,
  destinationBatchId: 'c3a97ec4-84f8-4a85-a493-b8d6feb84a27',
  sourceMovementId: 'a2f2d7a4-0948-49c4-a0a8-afbf88503a5c',
  destinationMovementId: 'b2f2d7a4-0948-49c4-a0a8-afbf88503a5c',
  quantity: 2,
  sourceOnHandAfter: 18,
  destinationOnHandAfter: 7,
  sourceBatchVersion: 5,
  destinationBatchVersion: 3,
  completedAt: '2026-08-14T04:00:00.000Z',
  replayed: false,
};

afterEach(() => vi.unstubAllGlobals());

describe('completed-transfer BFF', () => {
  it('forwards the exact correlated command and returns private no-store', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(receipt));
    vi.stubGlobal('fetch', fetchMock);
    const response = await POST(request(command), context);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects cross-origin, same-provider, and over-broad commands', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect((await POST(request(command, 'https://attacker.example'), context)).status).toBe(403);
    expect(
      (await POST(request({ ...command, destinationProviderId: providerId }), context)).status,
    ).toBe(400);
    expect((await POST(request({ ...command, tenantId: 'leak' }), context)).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects mismatched receipts and preserves conflicts', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ ...receipt, quantity: 3 })));
    expect((await POST(request(command), context)).status).toBe(502);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ message: 'Version conflict' }, { status: 409 })),
    );
    expect((await POST(request(command), context)).status).toBe(409);
  });
});

function request(body: unknown, origin = 'http://localhost') {
  return new NextRequest(`http://localhost/api/inventory/providers/${providerId}/transfers`, {
    method: 'POST',
    headers: {
      origin,
      cookie: 'medsphere_access=access-secret',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}
