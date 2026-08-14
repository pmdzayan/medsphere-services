// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';

const providerId = '7f51a0f3-3bd1-45d7-85f3-b8b725969df9';
const context = { params: Promise.resolve({ providerId }) };
const command = {
  subjectUserId: 'f63f50dd-49b0-4a77-bc04-f7d00db58dd5',
  expiresAt: '2027-08-01T12:00:00.000Z',
  items: [{ productId: '8b4d574f-48c6-4231-8851-e65edc9f9d42', quantity: 2 }],
  idempotencyKey: 'reservation-create-1',
};
const receipt = {
  reservationId: '73a97ec4-84f8-4a85-a493-b8d6feb84a27',
  status: 'PENDING',
  version: 1,
  itemCount: 1,
  totalQuantity: 2,
  replayed: false,
};

afterEach(() => vi.unstubAllGlobals());

describe('reservation creation BFF', () => {
  it('forwards the exact command and preserves private no-store', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(receipt));
    vi.stubGlobal('fetch', fetchMock);
    const response = await POST(request(command), context);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(`/providers/${providerId}/reservations`);
    expect(init).toMatchObject({ method: 'POST', body: JSON.stringify(command) });
  });

  it('rejects cross-origin, duplicate products, and over-broad commands before forwarding', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect((await POST(request(command, 'https://attacker.example'), context)).status).toBe(403);
    expect((await POST(request({ ...command, tenantId: 'leak' }), context)).status).toBe(400);
    expect(
      (await POST(request({ ...command, items: [command.items[0], command.items[0]] }), context))
        .status,
    ).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects mismatched receipts and preserves stock conflicts', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ ...receipt, itemCount: 2 })));
    expect((await POST(request(command), context)).status).toBe(502);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ message: 'Insufficient stock' }, { status: 409 })),
    );
    expect((await POST(request(command), context)).status).toBe(409);
  });
});

function request(body: unknown, origin = 'http://localhost') {
  return new NextRequest(`http://localhost/api/inventory/providers/${providerId}/reservations`, {
    method: 'POST',
    headers: {
      origin,
      cookie: 'medsphere_access=access-secret',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}
