import { NextRequest, NextResponse } from 'next/server';
import {
  authApiUrl,
  boundedUpstreamMessage,
  isSameOriginMutation,
  publicUpstreamStatus,
  upstreamHeaders,
} from '@/lib/auth-api';
import { isTokenResponse } from '@/lib/auth-contract';
import { clearSessionCookies, setSessionCookies } from '@/lib/session-cookies';
import { PROFILE_COOKIE, REFRESH_COOKIE, readSessionProfile } from '@/lib/session-profile';

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ message: 'Cross-origin request rejected.' }, { status: 403 });
  }

  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;
  const profile = readSessionProfile(request.cookies.get(PROFILE_COOKIE)?.value, refreshToken);
  if (!refreshToken || !profile) {
    return expiredResponse();
  }

  let upstream: Response;
  try {
    const headers = upstreamHeaders(request);
    headers.set('content-type', 'application/json');
    upstream = await fetch(authApiUrl('/auth/refresh'), {
      method: 'POST',
      headers,
      body: JSON.stringify({ refreshToken }),
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json(
      { message: 'Authentication service is unavailable.' },
      { status: 503 },
    );
  }

  if (!upstream.ok) {
    if (upstream.status === 401) {
      return expiredResponse();
    }
    const message = await boundedUpstreamMessage(upstream, 'Unable to refresh the session.');
    return NextResponse.json({ message }, { status: publicUpstreamStatus(upstream.status) });
  }

  try {
    const credentials: unknown = await upstream.json();
    if (!isTokenResponse(credentials)) {
      throw new Error('Invalid refresh response');
    }
    const response = NextResponse.json({ expiresIn: credentials.expiresIn });
    setSessionCookies(response, credentials, { ...profile, expiresIn: credentials.expiresIn });
    return response;
  } catch {
    return NextResponse.json(
      { message: 'Authentication service returned an invalid response.' },
      { status: 502 },
    );
  }
}

function expiredResponse(): NextResponse {
  const response = NextResponse.json(
    { message: 'Your session has expired. Sign in again.' },
    { status: 401 },
  );
  clearSessionCookies(response);
  return response;
}
