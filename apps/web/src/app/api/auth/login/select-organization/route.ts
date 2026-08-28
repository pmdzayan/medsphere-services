import { NextRequest, NextResponse } from 'next/server';
import type { LoginResponse } from '@/lib/auth-contract';
import { isLoginResponse, isSelectOrganizationLoginRequest } from '@/lib/auth-contract';
import { authApiUrl, isSameOriginMutation, upstreamHeaders } from '@/lib/auth-api';
import { setSessionCookies } from '@/lib/session-cookies';

/** Task 0010: slug-free login, step 2 -- completes login for a chosen membership. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isSameOriginMutation(request)) {
    return noStore({ message: 'Cross-origin request rejected.' }, 403);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return noStore({ message: 'Invalid sign-in request.' }, 400);
  }

  if (!isSelectOrganizationLoginRequest(payload)) {
    return noStore({ message: 'Invalid sign-in request.' }, 400);
  }

  let upstream: Response;
  try {
    const headers = upstreamHeaders(request);
    headers.set('content-type', 'application/json');
    upstream = await fetch(authApiUrl('/auth/login/select-organization'), {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      cache: 'no-store',
    });
  } catch {
    return noStore({ message: 'Authentication service is unavailable.' }, 503);
  }

  if (!upstream.ok) {
    return noStore(
      {
        message:
          upstream.status === 401
            ? 'The email or password is incorrect.'
            : 'Sign-in failed. Try again.',
      },
      upstream.status >= 500 ? 502 : upstream.status,
    );
  }

  let session: LoginResponse;
  try {
    const body: unknown = await upstream.json();
    if (!isLoginResponse(body)) {
      throw new Error('Invalid authentication response');
    }
    session = body;
  } catch {
    return noStore({ message: 'Authentication service returned an invalid response.' }, 502);
  }

  const response = noStore(
    { expiresIn: session.expiresIn, user: session.user, context: session.context },
    200,
  );
  setSessionCookies(response, session, {
    expiresIn: session.expiresIn,
    user: session.user,
    context: session.context,
  });
  return response;
}

function noStore(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, { status, headers: { 'cache-control': 'no-store' } });
}
