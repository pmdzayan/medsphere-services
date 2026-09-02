import { NextRequest, NextResponse } from 'next/server';

import {
  authApiUrl,
  boundedUpstreamMessage,
  isSameOriginMutation,
  noStoreJson,
  publicUpstreamStatus,
  upstreamHeaders,
} from '@/lib/auth-api';
import { isWorkstationLockRequest, isWorkstationLockResponse } from '@/lib/auth-contract';
import { clearAccessCookie } from '@/lib/session-cookies';
import { ACCESS_COOKIE } from '@/lib/session-profile';

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isSameOriginMutation(request)) {
    return noStoreJson({ message: 'Cross-origin request rejected.' }, 403);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return noStoreJson({ message: 'Invalid workstation lock request.' }, 400);
  }

  if (!isWorkstationLockRequest(payload)) {
    return noStoreJson({ message: 'Invalid workstation lock request.' }, 400);
  }

  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!accessToken) {
    return noStoreJson({ message: 'Authentication required.' }, 401);
  }

  let upstream: Response;
  try {
    const headers = upstreamHeaders(request, accessToken);
    headers.set('content-type', 'application/json');

    upstream = await fetch(authApiUrl('/auth/lock'), {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      cache: 'no-store',
    });
  } catch {
    return noStoreJson({ message: 'Authentication service is unavailable.' }, 503);
  }

  if (!upstream.ok) {
    const message = await boundedUpstreamMessage(upstream, 'Unable to lock the workstation.');

    return noStoreJson({ message }, publicUpstreamStatus(upstream.status));
  }

  try {
    const result: unknown = await upstream.json();

    if (!isWorkstationLockResponse(result)) {
      throw new Error('Invalid workstation lock response');
    }

    const response = noStoreJson(result, 200);

    // The server has advanced securityVersion, so the old JWT is unusable.
    // Remove it locally while preserving the HTTP-only refresh credential.
    clearAccessCookie(response);

    return response;
  } catch {
    return noStoreJson({ message: 'Authentication service returned an invalid response.' }, 502);
  }
}
