import { NextRequest, NextResponse } from 'next/server';
import {
  authApiUrl,
  boundedUpstreamMessage,
  isSameOriginMutation,
  publicUpstreamStatus,
  upstreamHeaders,
} from '@/lib/auth-api';
import { isLanguageUpdateRequest, isLanguageUpdateResponse } from '@/lib/settings-contract';
import { ACCESS_COOKIE } from '@/lib/session-profile';

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  if (!isSameOriginMutation(request)) {
    return noStore({ message: 'Cross-origin request rejected.' }, 403);
  }
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!accessToken) {
    return noStore({ message: 'Your session has expired. Sign in again.' }, 401);
  }

  let body: unknown;
  try {
    body = await request.json();
    if (!isLanguageUpdateRequest(body)) throw new Error('Invalid language update');
  } catch {
    return noStore({ message: 'Invalid language update.' }, 400);
  }

  let upstream: Response;
  try {
    const headers = upstreamHeaders(request, accessToken);
    headers.set('content-type', 'application/json');
    upstream = await fetch(authApiUrl('/users/me/language'), {
      method: 'PATCH',
      headers,
      body: JSON.stringify(body),
      cache: 'no-store',
    });
  } catch {
    return noStore({ message: 'Language service is unavailable.' }, 503);
  }

  if (!upstream.ok) {
    const message = await boundedUpstreamMessage(upstream, 'Unable to update language.');
    return noStore({ message }, publicUpstreamStatus(upstream.status));
  }

  try {
    const payload: unknown = await upstream.json();
    if (!isLanguageUpdateResponse(payload)) throw new Error('Invalid language update response');
    return noStore(payload, 200);
  } catch {
    return noStore({ message: 'Language service returned an invalid response.' }, 502);
  }
}

function noStore(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, { status, headers: { 'cache-control': 'no-store' } });
}
