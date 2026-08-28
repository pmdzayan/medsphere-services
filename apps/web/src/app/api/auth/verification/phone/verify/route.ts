import { NextRequest, NextResponse } from 'next/server';
import { authApiUrl, isSameOriginMutation, upstreamHeaders } from '@/lib/auth-api';

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isSameOriginMutation(request)) {
    return noStore({ message: 'Cross-origin request rejected.' }, 403);
  }

  const payload = await readPayload(request);
  if (!payload) return noStore({ message: 'Invalid verification request.' }, 400);

  try {
    const headers = upstreamHeaders(request);
    headers.set('content-type', 'application/json');
    const upstream = await fetch(authApiUrl('/account-verification/phone/otp/verify'), {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      cache: 'no-store',
    });
    if (!upstream.ok) {
      return noStore(
        {
          message:
            upstream.status === 429 ? 'Try again later.' : 'Invalid or expired verification code.',
        },
        upstream.status >= 500 ? 502 : upstream.status,
      );
    }
    const body: unknown = await upstream.json();
    if (!body || typeof body !== 'object') {
      return noStore({ message: 'Invalid verification response.' }, 502);
    }
    const result = body as Record<string, unknown>;
    if (typeof result.activated !== 'boolean' || typeof result.replayed !== 'boolean') {
      return noStore({ message: 'Invalid verification response.' }, 502);
    }
    return noStore({ activated: result.activated, replayed: result.replayed }, 200);
  } catch {
    return noStore({ message: 'Verification service is unavailable.' }, 503);
  }
}

async function readPayload(request: NextRequest): Promise<{ email: string; code: string } | null> {
  try {
    const value: unknown = await request.json();
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const candidate = value as Record<string, unknown>;
    const email = typeof candidate.email === 'string' ? candidate.email.trim().toLowerCase() : '';
    const code = typeof candidate.code === 'string' ? candidate.code.trim() : '';
    return Object.keys(candidate).sort().join(',') === 'code,email' &&
      email.length <= 254 &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) &&
      /^\d{6}$/.test(code)
      ? { email, code }
      : null;
  } catch {
    return null;
  }
}

function noStore(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, { status, headers: { 'cache-control': 'no-store' } });
}
