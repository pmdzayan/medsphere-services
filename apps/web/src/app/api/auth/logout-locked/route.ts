import { NextRequest, NextResponse } from 'next/server';

import {
  authApiUrl,
  boundedUpstreamMessage,
  isSameOriginMutation,
  noStoreJson,
  publicUpstreamStatus,
  upstreamHeaders,
} from '@/lib/auth-api';
import { clearSessionCookies } from '@/lib/session-cookies';
import { REFRESH_COOKIE } from '@/lib/session-profile';

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isSameOriginMutation(request)) {
    return noStoreJson({ message: 'Cross-origin request rejected.' }, 403);
  }

  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;

  if (!refreshToken) {
    const response = noStoreJson({ message: 'Signed out.' }, 200);
    clearSessionCookies(response);
    return response;
  }

  let upstream: Response;
  try {
    const headers = upstreamHeaders(request);
    headers.set('x-locked-session-refresh', refreshToken);

    upstream = await fetch(authApiUrl('/auth/logout-locked'), {
      method: 'POST',
      headers,
      cache: 'no-store',
    });
  } catch {
    return noStoreJson({ message: 'Authentication service is unavailable.' }, 503);
  }

  if (!upstream.ok) {
    if (upstream.status === 401) {
      const response = noStoreJson({ message: 'Signed out.' }, 200);
      clearSessionCookies(response);
      return response;
    }

    const message = await boundedUpstreamMessage(upstream, 'Unable to sign out securely.');

    return noStoreJson({ message }, publicUpstreamStatus(upstream.status));
  }

  const response = noStoreJson({ message: 'Signed out.' }, 200);
  clearSessionCookies(response);
  return response;
}
