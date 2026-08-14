// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';

const providerId = '7f51a0f3-3bd1-45d7-85f3-b8b725969df9';
const reservationId = 'f63f50dd-49b0-4a77-bc04-f7d00db58dd5';
const context = { params: Promise.resolve({ providerId, reservationId }) };
const command = { transition: 'READY', expectedVersion: 2, idempotencyKey: 'ready-1' };
const receipt = { reservationId, status: 'READY', version: 3, totalQuantity: 2, replayed: false };

afterEach(() => vi.unstubAllGlobals());

describe('reservation transition BFF', () => {
  it('forwards the exact command and preserves private no-store', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(receipt));
    vi.stubGlobal('fetch', fetchMock);
    const response = await POST(request(command), context);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(`/providers/${providerId}/reservations/${reservationId}/transitions`);
    expect(init).toMatchObject({ method: 'POST', body: JSON.stringify(command) });
  });

  it('rejects cross-origin and over-broad commands before forwarding', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect((await POST(request(command, 'https://attacker.example'), context)).status).toBe(403);
    expect((await POST(request({ ...command, tenantId: 'leak' }), context)).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects over-broad receipts and preserves conflicts', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ ...receipt, patient: true })));
    expect((await POST(request(command), context)).status).toBe(502);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ message: 'Version conflict' }, { status: 409 })),
    );
    expect((await POST(request(command), context)).status).toBe(409);
  });
});

function request(body: unknown, origin = 'http://localhost') {
  return new NextRequest(
    `http://localhost/api/inventory/providers/${providerId}/reservations/${reservationId}/transitions`,
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
