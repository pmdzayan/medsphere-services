import { NextRequest, NextResponse } from 'next/server';
import {
  authApiUrl,
  boundedUpstreamMessage,
  noStoreJson,
  publicUpstreamStatus,
  upstreamHeaders,
} from '@/lib/auth-api';
import { isMembershipCatalogue } from '@/lib/authorization-contract';
import { ACCESS_COOKIE } from '@/lib/session-profile';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!accessToken) return noStoreJson({ message: 'Your session has expired.' }, 401);
  try {
    const upstream = await fetch(authApiUrl('/authorization/memberships?limit=100&offset=0'), {
      headers: upstreamHeaders(request, accessToken),
      cache: 'no-store',
    });
    if (!upstream.ok) {
      const message = await boundedUpstreamMessage(upstream, 'Unable to load team members.');
      return noStoreJson({ message }, publicUpstreamStatus(upstream.status));
    }
    const catalogue: unknown = await upstream.json();
    return isMembershipCatalogue(catalogue)
      ? noStoreJson(catalogue, 200)
      : noStoreJson({ message: 'Authorization service returned an invalid response.' }, 502);
  } catch {
    return noStoreJson({ message: 'Authorization service is unavailable.' }, 503);
  }
}
