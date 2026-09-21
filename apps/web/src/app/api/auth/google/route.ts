import { NextResponse, type NextRequest } from 'next/server';

import type { LoginResponse, OrganizationSelectionRequired } from '@/lib/auth-contract';
import {
  isGoogleLoginRequest,
  isLoginResponse,
  isOrganizationSelectionRequired,
  normalizeGoogleLoginRequest,
  validateGoogleLoginRequest,
} from '@/lib/auth-contract';
import { authApiUrl, isSameOriginMutation, upstreamHeaders } from '@/lib/auth-api';
import { setSessionCookies } from '@/lib/session-cookies';

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isSameOriginMutation(request)) {
    return noStore({ message: 'Cross-origin request rejected.' }, 403);
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return noStore({ message: 'Invalid Google sign-in request.' }, 400);
  }

  if (!isGoogleLoginRequest(payload)) {
    return noStore({ message: 'Invalid Google sign-in request.' }, 400);
  }

  const normalized = normalizeGoogleLoginRequest(payload);

  if (Object.keys(validateGoogleLoginRequest(normalized)).length > 0) {
    return noStore({ message: 'Invalid Google sign-in request.' }, 400);
  }

  let upstream: Response;

  try {
    const headers = upstreamHeaders(request);
    headers.set('content-type', 'application/json');

    upstream = await fetch(authApiUrl('/auth/google'), {
      method: 'POST',
      headers,
      body: JSON.stringify(normalized),
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
            ? 'Google sign-in could not be authorized.'
            : 'Google sign-in failed. Try again.',
      },
      upstream.status >= 500 ? 502 : upstream.status,
    );
  }

  let body: unknown;

  try {
    body = await upstream.json();
  } catch {
    return noStore({ message: 'Authentication service returned an invalid response.' }, 502);
  }

  if (isOrganizationSelectionRequired(body)) {
    const selection: OrganizationSelectionRequired = body;
    return noStore(selection, 200);
  }

  if (!isLoginResponse(body)) {
    return noStore({ message: 'Authentication service returned an invalid response.' }, 502);
  }

  const session: LoginResponse = body;

  const response = noStore(
    {
      expiresIn: session.expiresIn,
      user: session.user,
      context: session.context,
    },
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
  return NextResponse.json(body, {
    status,
    headers: { 'cache-control': 'no-store' },
  });
}
