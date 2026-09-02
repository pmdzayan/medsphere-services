import { NextRequest, NextResponse } from 'next/server';

import {
  authApiUrl,
  boundedUpstreamMessage,
  isSameOriginMutation,
  noStoreJson,
  publicUpstreamStatus,
  upstreamHeaders,
} from '@/lib/auth-api';
import { isWorkstationUnlockRequest } from '@/lib/auth-contract';
import { ACCESS_COOKIE } from '@/lib/session-profile';

type ReauthenticateResponse = {
  reauthenticated: true;
  recentAuthenticatedAt: string;
};

function isReauthenticateResponse(value: unknown): value is ReauthenticateResponse {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  if (Object.keys(candidate).sort().join(',') !== 'reauthenticated,recentAuthenticatedAt') {
    return false;
  }

  return (
    candidate.reauthenticated === true &&
    typeof candidate.recentAuthenticatedAt === 'string' &&
    candidate.recentAuthenticatedAt.length > 0 &&
    Number.isFinite(Date.parse(candidate.recentAuthenticatedAt))
  );
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isSameOriginMutation(request)) {
    return noStoreJson({ message: 'Cross-origin request rejected.' }, 403);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return noStoreJson({ message: 'Invalid re-authentication request.' }, 400);
  }

  if (!isWorkstationUnlockRequest(payload)) {
    return noStoreJson({ message: 'Invalid re-authentication request.' }, 400);
  }

  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!accessToken) {
    return noStoreJson({ message: 'Authentication required.' }, 401);
  }

  let upstream: Response;
  try {
    const headers = upstreamHeaders(request, accessToken);
    headers.set('content-type', 'application/json');

    upstream = await fetch(authApiUrl('/auth/reauthenticate'), {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      cache: 'no-store',
    });
  } catch {
    return noStoreJson({ message: 'Authentication service is unavailable.' }, 503);
  }

  if (!upstream.ok) {
    const message = await boundedUpstreamMessage(
      upstream,
      'Unable to re-authenticate the current session.',
    );

    // Deliberately preserve all session cookies. An upstream 401 can mean
    // either a rejected credential proof or an invalid current session.
    // Re-authentication must never destroy a valid session merely because
    // the operator entered the wrong password or Google credential.
    return noStoreJson({ message }, publicUpstreamStatus(upstream.status));
  }

  let result: unknown;
  try {
    result = await upstream.json();
  } catch {
    return noStoreJson({ message: 'Authentication service returned an invalid response.' }, 502);
  }

  if (!isReauthenticateResponse(result)) {
    return noStoreJson({ message: 'Authentication service returned an invalid response.' }, 502);
  }

  return noStoreJson(result, 200);
}
