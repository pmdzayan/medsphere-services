// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST } from './route';

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
  return new NextRequest(
    `https://app.example.test/api/pharmacy/providers/${PROVIDER_ID}/verification`,
    {
      method: options.method ?? 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    },
  );
}

const context = { params: Promise.resolve({ providerId: PROVIDER_ID }) };

afterEach(() => {
  vi.unstubAllGlobals();
});

const currentApproved = {
  verificationId: '22222222-2222-4222-8222-222222222222',
  status: 'APPROVED',
  submittedAt: '2026-01-01T00:00:00.000Z',
  licenseExpiryDate: '2027-01-01T00:00:00.000Z',
  applicantMessage: null,
  version: 3,
};

describe('GET /api/pharmacy/providers/[providerId]/verification', () => {
  it('preserves an initial PENDING submission with no current state', async () => {
    const pending = { ...currentApproved, status: 'PENDING' };
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ current: pending, openSubmission: null }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET(createRequest({ cookie: 'medsphere_access=token' }), context);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { current: unknown; openSubmission: unknown };
    expect((body.current as { status: string }).status).toBe('PENDING');
    expect(body.openSubmission).toBeNull();
  });

  it('preserves valid approval + pending renewal as TWO distinct states, never flattened', async () => {
    const renewal = {
      ...currentApproved,
      verificationId: '33333333-3333-4333-8333-333333333333',
      status: 'UNDER_REVIEW',
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ current: currentApproved, openSubmission: renewal }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET(createRequest({ cookie: 'medsphere_access=token' }), context);
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      current: { status: string };
      openSubmission: { status: string };
    };
    expect(body.current.status).toBe('APPROVED');
    expect(body.openSubmission.status).toBe('UNDER_REVIEW');
  });

  it('preserves a rejection applicantMessage', async () => {
    const rejected = { ...currentApproved, status: 'REJECTED', applicantMessage: 'Please retry.' };
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ current: rejected, openSubmission: null }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET(createRequest({ cookie: 'medsphere_access=token' }), context);
    const body = (await response.json()) as { current: { applicantMessage: string } };
    expect(body.current.applicantMessage).toBe('Please retry.');
  });

  it('treats a response leaking internal verificationNotes as invalid and returns a safe error', async () => {
    const tampered = { ...currentApproved, verificationNotes: 'internal reasoning' };
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ current: tampered, openSubmission: null }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET(createRequest({ cookie: 'medsphere_access=token' }), context);
    expect(response.status).toBe(503);
    const body = (await response.json()) as { message: string };
    expect(body.message).not.toContain('internal reasoning');
  });

  it('rejects a missing session without calling the backend', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const response = await GET(createRequest(), context);
    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/pharmacy/providers/[providerId]/verification', () => {
  const validBody = {
    licenseNumber: 'LIC-1234',
    licenseExpiryDate: '2027-01-01T00:00:00.000Z',
    businessRegistrationNumber: 'REG-1234',
    governmentIdReference: 'GOV-REF-1234',
  };

  it('accepts a valid submission and forwards it', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ verificationId: PROVIDER_ID }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await POST(
      createRequest({
        method: 'POST',
        origin: 'https://app.example.test',
        cookie: 'medsphere_access=token',
        body: validBody,
      }),
      context,
    );

    expect(response.status).toBe(200);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const sentBody = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(sentBody).toEqual(validBody);
  });

  it('rejects an upstream receipt containing internal reviewer notes', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ verificationId: PROVIDER_ID, verificationNotes: 'internal' }),
        ),
    );
    const response = await POST(
      createRequest({
        method: 'POST',
        origin: 'https://app.example.test',
        cookie: 'medsphere_access=token',
        body: validBody,
      }),
      context,
    );
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      message: 'Verification service returned an invalid response.',
    });
  });

  it('rejects an unexpected key BEFORE calling the backend', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const response = await POST(
      createRequest({
        method: 'POST',
        origin: 'https://app.example.test',
        cookie: 'medsphere_access=token',
        body: { ...validBody, extra: 'y' },
      }),
      context,
    );
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a "status" override attempt before calling the backend', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const response = await POST(
      createRequest({
        method: 'POST',
        origin: 'https://app.example.test',
        cookie: 'medsphere_access=token',
        body: { ...validBody, status: 'APPROVED' },
      }),
      context,
    );
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a "tenantId" override attempt before calling the backend', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const response = await POST(
      createRequest({
        method: 'POST',
        origin: 'https://app.example.test',
        cookie: 'medsphere_access=token',
        body: { ...validBody, tenantId: 'attacker-id' },
      }),
      context,
    );
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects "reviewer"/"reviewerId"/"verificationNotes" fields before calling the backend', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const response = await POST(
      createRequest({
        method: 'POST',
        origin: 'https://app.example.test',
        cookie: 'medsphere_access=token',
        body: { ...validBody, verificationNotes: 'x' },
      }),
      context,
    );
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects an http:// evidence reference before calling the backend', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const response = await POST(
      createRequest({
        method: 'POST',
        origin: 'https://app.example.test',
        cookie: 'medsphere_access=token',
        body: { ...validBody, governmentIdReference: 'http://example.com/doc.pdf' },
      }),
      context,
    );
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects an https:example.com scheme value before calling the backend', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const response = await POST(
      createRequest({
        method: 'POST',
        origin: 'https://app.example.test',
        cookie: 'medsphere_access=token',
        body: { ...validBody, governmentIdReference: 'https:example.com' },
      }),
      context,
    );
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a javascript: scheme value before calling the backend', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const response = await POST(
      createRequest({
        method: 'POST',
        origin: 'https://app.example.test',
        cookie: 'medsphere_access=token',
        body: { ...validBody, governmentIdReference: 'javascript:alert(1)' },
      }),
      context,
    );
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('accepts a UUID evidence reference', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ verificationId: PROVIDER_ID }));
    vi.stubGlobal('fetch', fetchMock);
    const response = await POST(
      createRequest({
        method: 'POST',
        origin: 'https://app.example.test',
        cookie: 'medsphere_access=token',
        body: { ...validBody, governmentIdReference: '123e4567-e89b-12d3-a456-426614174000' },
      }),
      context,
    );
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalled();
  });

  it('rejects cross-origin POST attempts without calling the backend', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const response = await POST(
      createRequest({
        method: 'POST',
        origin: 'https://attacker.example',
        cookie: 'medsphere_access=token',
        body: validBody,
      }),
      context,
    );
    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
