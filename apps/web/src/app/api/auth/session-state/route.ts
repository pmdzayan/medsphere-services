import { NextRequest, NextResponse } from 'next/server';

import {
  authApiUrl,
  boundedUpstreamMessage,
  isSameOriginMutation,
  noStoreJson,
  publicUpstreamStatus,
  upstreamHeaders,
} from '@/lib/auth-api';
import { isWorkstationSessionState } from '@/lib/auth-contract';
import { clearSessionCookies } from '@/lib/session-cookies';
import { REFRESH_COOKIE } from '@/lib/session-profile';

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isSameOriginMutation(request)) {
    return noStoreJson({ message: 'Cross-origin request rejected.' }, 403);
  }

  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;
  if (!refreshToken) {
    return expiredResponse();
  }

  let upstream: Response;
  try {
    const headers = upstreamHeaders(request);
    headers.set('x-locked-session-refresh', refreshToken);

    upstream = await fetch(authApiUrl('/auth/session-state'), {
      method: 'POST',
      headers,
      cache: 'no-store',
    });
  } catch {
    return noStoreJson({ message: 'Authentication service is unavailable.' }, 503);
  }

  if (!upstream.ok) {
    if (upstream.status === 401) {
      return expiredResponse();
    }

    const message = await boundedUpstreamMessage(
      upstream,
      'Unable to verify workstation session state.',
    );

    return noStoreJson({ message }, publicUpstreamStatus(upstream.status));
  }

  try {
    const state: unknown = await upstream.json();

    if (!isWorkstationSessionState(state)) {
      throw new Error('Invalid workstation session-state response');
    }

    return noStoreJson(state, 200);
  } catch {
    return noStoreJson({ message: 'Authentication service returned an invalid response.' }, 502);
  }
}

function expiredResponse(): NextResponse {
  const response = noStoreJson({ message: 'Your session has expired. Sign in again.' }, 401);
  clearSessionCookies(response);
  return response;
}
