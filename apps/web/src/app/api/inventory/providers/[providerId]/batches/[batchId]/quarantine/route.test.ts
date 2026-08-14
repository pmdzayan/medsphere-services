// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';

const providerId = '7f51a0f3-3bd1-45d7-85f3-b8b725969df9';
const batchId = '73a97ec4-84f8-4a85-a493-b8d6feb84a27';
const context = { params: Promise.resolve({ providerId, batchId }) };
const command = {
  expectedVersion: 4,
  idempotencyKey: 'quarantine-command-1',
  reasonCode: 'QUALITY_SUSPECT',
};
const receipt = {
  batchId,
  status: 'QUARANTINED',
  reasonCode: 'QUALITY_SUSPECT',
  onHandQuantity: 20,
  affectedReservationCount: 1,
  releasedUnitCount: 3,
  resultingBatchVersion: 5,
  occurredAt: '2026-08-14T01:00:00.000Z',
  replayed: false,
};

afterEach(() => vi.unstubAllGlobals());

describe('batch quarantine mutation BFF', () => {
  it('forwards only the accepted command and preserves private no-store behavior', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(receipt));
    vi.stubGlobal('fetch', fetchMock);
    const response = await POST(request(command), context);

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(`/providers/${providerId}/batches/${batchId}/quarantine`);
    expect(init).toMatchObject({ method: 'POST', body: JSON.stringify(command) });
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer access-secret');
  });

  it('rejects cross-origin, malformed, and over-broad commands before forwarding', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect((await POST(request(command, 'https://attacker.example'), context)).status).toBe(403);
    expect((await POST(request({ ...command, tenantId: 'attacker' }), context)).status).toBe(400);
    expect((await POST(request({ ...command, expectedVersion: 0 }), context)).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects invalid upstream receipts and preserves version conflicts', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ ...receipt, internal: true })),
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
    `http://localhost/api/inventory/providers/${providerId}/batches/${batchId}/quarantine`,
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
