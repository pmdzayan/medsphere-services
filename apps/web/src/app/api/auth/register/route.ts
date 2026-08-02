import { NextRequest, NextResponse } from 'next/server';
import {
  isRegistrationRequest,
  isRegistrationResponse,
  normalizeRegistrationRequest,
  validateRegistrationRequest,
} from '@/lib/auth-contract';
import { authApiUrl, isSameOriginMutation, upstreamHeaders } from '@/lib/auth-api';

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isSameOriginMutation(request)) {
    return noStore({ message: 'Cross-origin request rejected.' }, 403);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return noStore({ message: 'Invalid onboarding request.' }, 400);
  }

  if (!isRegistrationRequest(payload)) {
    return noStore({ message: 'Invalid onboarding request.' }, 400);
  }

  const registration = normalizeRegistrationRequest(payload);
  if (Object.keys(validateRegistrationRequest(registration)).length > 0) {
    return noStore({ message: 'Invalid onboarding request.' }, 400);
  }

  let upstream: Response;
  try {
    const headers = upstreamHeaders(request);
    headers.set('content-type', 'application/json');
    upstream = await fetch(authApiUrl('/auth/register'), {
      method: 'POST',
      headers,
      body: JSON.stringify(registration),
      cache: 'no-store',
    });
  } catch {
    return noStore({ message: 'Onboarding service is unavailable.' }, 503);
  }

  if (!upstream.ok) {
    if (upstream.status === 429) {
      return noStore({ message: 'Too many onboarding requests. Try again later.' }, 429);
    }
    return noStore(
      { message: 'Unable to process the onboarding request.' },
      upstream.status >= 500 ? 502 : 400,
    );
  }

  try {
    const responsePayload: unknown = await upstream.json();
    if (!isRegistrationResponse(responsePayload)) {
      throw new Error('Invalid registration response');
    }
    return noStore(responsePayload, 202);
  } catch {
    return noStore({ message: 'Onboarding service returned an invalid response.' }, 502);
  }
}

function noStore(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, { status, headers: { 'cache-control': 'no-store' } });
}
