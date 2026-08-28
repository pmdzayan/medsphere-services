import { NextRequest, NextResponse } from 'next/server';
import { authApiUrl, isSameOriginMutation, upstreamHeaders } from '@/lib/auth-api';

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isSameOriginMutation(request)) {
    return noStore({ message: 'Cross-origin request rejected.' }, 403);
  }
  const payload = await readEmail(request);
  if (!payload) return noStore({ message: 'Invalid verification request.' }, 400);

  try {
    const headers = upstreamHeaders(request);
    headers.set('content-type', 'application/json');
    const upstream = await fetch(authApiUrl('/account-verification/phone/otp/request'), {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      cache: 'no-store',
    });
    if (!upstream.ok) {
      return noStore(
        {
          message:
            upstream.status === 429
              ? 'Try again later.'
              : 'Unable to send verification code.',
        },
        upstream.status >= 500 ? 502 : upstream.status,
      );
    }
    return noStore({ message: 'If eligible, a verification code has been sent.' }, 200);
  } catch {
    return noStore({ message: 'Verification service is unavailable.' }, 503);
  }
}

async function readEmail(request: NextRequest): Promise<{ email: string } | null> {
  try {
    const value: unknown = await request.json();
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const candidate = value as Record<string, unknown>;
    if (Object.keys(candidate).join(',') !== 'email' || typeof candidate.email !== 'string') {
      return null;
    }
    const email = candidate.email.trim().toLowerCase();
    return email.length > 0 && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
      ? { email }
      : null;
  } catch {
    return null;
  }
}

function noStore(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, { status, headers: { 'cache-control': 'no-store' } });
}
