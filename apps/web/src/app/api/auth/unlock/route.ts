import { NextRequest, NextResponse } from 'next/server';

import {
  authApiUrl,
  boundedUpstreamMessage,
  isSameOriginMutation,
  noStoreJson,
  publicUpstreamStatus,
  upstreamHeaders,
} from '@/lib/auth-api';
import {
  isLoginResponse,
  isWorkstationUnlockRequest,
  type LoginResponse,
} from '@/lib/auth-contract';
import { setSessionCookies } from '@/lib/session-cookies';
import { REFRESH_COOKIE } from '@/lib/session-profile';

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isSameOriginMutation(request)) {
    return noStoreJson({ message: 'Cross-origin request rejected.' }, 403);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return noStoreJson({ message: 'Invalid unlock request.' }, 400);
  }

  if (!isWorkstationUnlockRequest(payload)) {
    return noStoreJson({ message: 'Invalid unlock request.' }, 400);
  }

  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;
  if (!refreshToken) {
    return noStoreJson({ message: 'Authentication required.' }, 401);
  }

  let upstream: Response;
  try {
    const headers = upstreamHeaders(request);
    headers.set('content-type', 'application/json');
    headers.set('x-locked-session-refresh', refreshToken);

    upstream = await fetch(authApiUrl('/auth/unlock'), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ...payload,
        refreshToken,
      }),
      cache: 'no-store',
    });
  } catch {
    return noStoreJson({ message: 'Authentication service is unavailable.' }, 503);
  }

  if (!upstream.ok) {
    const message = await boundedUpstreamMessage(upstream, 'Unable to unlock the workstation.');

    return noStoreJson({ message }, publicUpstreamStatus(upstream.status));
  }

  let session: LoginResponse;
  try {
    const result: unknown = await upstream.json();

    if (!isLoginResponse(result)) {
      throw new Error('Invalid unlock response');
    }

    session = result;
  } catch {
    return noStoreJson({ message: 'Authentication service returned an invalid response.' }, 502);
  }

  const response = noStoreJson(
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
