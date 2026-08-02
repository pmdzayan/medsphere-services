import { NextRequest, NextResponse } from 'next/server';
import {
  authApiUrl,
  boundedUpstreamMessage,
  publicUpstreamStatus,
  upstreamHeaders,
} from '@/lib/auth-api';
import { isSupportedLanguages } from '@/lib/settings-contract';
import { ACCESS_COOKIE } from '@/lib/session-profile';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!accessToken) {
    return noStore({ message: 'Your session has expired. Sign in again.' }, 401);
  }

  let upstream: Response;
  try {
    upstream = await fetch(authApiUrl('/localization/languages'), {
      headers: upstreamHeaders(request, accessToken),
      cache: 'no-store',
    });
  } catch {
    return noStore({ message: 'Language service is unavailable.' }, 503);
  }

  if (!upstream.ok) {
    const message = await boundedUpstreamMessage(upstream, 'Unable to load supported languages.');
    return noStore({ message }, publicUpstreamStatus(upstream.status));
  }

  try {
    const payload: unknown = await upstream.json();
    if (!isSupportedLanguages(payload)) throw new Error('Invalid language response');
    return noStore(payload, 200);
  } catch {
    return noStore({ message: 'Language service returned an invalid response.' }, 502);
  }
}

function noStore(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, { status, headers: { 'cache-control': 'no-store' } });
}
