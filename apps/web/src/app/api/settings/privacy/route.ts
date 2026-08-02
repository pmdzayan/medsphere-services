import { NextRequest, NextResponse } from 'next/server';
import {
  authApiUrl,
  boundedUpstreamMessage,
  isSameOriginMutation,
  publicUpstreamStatus,
  upstreamHeaders,
} from '@/lib/auth-api';
import {
  isPrivacyPreferences,
  isPrivacyPreferenceUpdate,
  type PrivacyPreferenceUpdate,
} from '@/lib/settings-contract';
import { ACCESS_COOKIE } from '@/lib/session-profile';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!accessToken) return unauthenticated();

  let upstream: Response;
  try {
    upstream = await fetch(authApiUrl('/users/me/privacy'), {
      headers: upstreamHeaders(request, accessToken),
      cache: 'no-store',
    });
  } catch {
    return noStore({ message: 'Privacy service is unavailable.' }, 503);
  }

  if (!upstream.ok) return upstreamFailure(upstream, 'Unable to load privacy preferences.');
  return validatedPrivacyResponse(upstream);
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  if (!isSameOriginMutation(request)) {
    return noStore({ message: 'Cross-origin request rejected.' }, 403);
  }
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!accessToken) return unauthenticated();

  let body: PrivacyPreferenceUpdate;
  try {
    const payload: unknown = await request.json();
    if (!isPrivacyPreferenceUpdate(payload)) throw new Error('Invalid privacy update');
    body = payload;
  } catch {
    return noStore({ message: 'Invalid privacy update.' }, 400);
  }

  let upstream: Response;
  try {
    const headers = upstreamHeaders(request, accessToken);
    headers.set('content-type', 'application/json');
    upstream = await fetch(authApiUrl('/users/me/privacy'), {
      method: 'PATCH',
      headers,
      body: JSON.stringify(body),
      cache: 'no-store',
    });
  } catch {
    return noStore({ message: 'Privacy service is unavailable.' }, 503);
  }

  if (!upstream.ok) return upstreamFailure(upstream, 'Unable to save privacy preferences.');
  return validatedPrivacyResponse(upstream);
}

async function validatedPrivacyResponse(upstream: Response): Promise<NextResponse> {
  try {
    const payload: unknown = await upstream.json();
    if (!isPrivacyPreferences(payload)) throw new Error('Invalid privacy response');
    return noStore(payload, 200);
  } catch {
    return noStore({ message: 'Privacy service returned an invalid response.' }, 502);
  }
}

async function upstreamFailure(upstream: Response, fallback: string): Promise<NextResponse> {
  const message = await boundedUpstreamMessage(upstream, fallback);
  return noStore({ message }, publicUpstreamStatus(upstream.status));
}

function unauthenticated(): NextResponse {
  return noStore({ message: 'Your session has expired. Sign in again.' }, 401);
}

function noStore(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, { status, headers: { 'cache-control': 'no-store' } });
}
