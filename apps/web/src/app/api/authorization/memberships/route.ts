import { NextRequest, NextResponse } from 'next/server';
import {
  authApiUrl,
  boundedUpstreamMessage,
  publicUpstreamStatus,
  upstreamHeaders,
} from '@/lib/auth-api';
import { isMembershipCatalogue } from '@/lib/authorization-contract';
import { ACCESS_COOKIE } from '@/lib/session-profile';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!accessToken)
    return NextResponse.json({ message: 'Your session has expired.' }, { status: 401 });
  try {
    const upstream = await fetch(authApiUrl('/authorization/memberships?limit=100&offset=0'), {
      headers: upstreamHeaders(request, accessToken),
      cache: 'no-store',
    });
    if (!upstream.ok) {
      const message = await boundedUpstreamMessage(upstream, 'Unable to load team members.');
      return NextResponse.json({ message }, { status: publicUpstreamStatus(upstream.status) });
    }
    const catalogue: unknown = await upstream.json();
    return isMembershipCatalogue(catalogue)
      ? NextResponse.json(catalogue)
      : NextResponse.json(
          { message: 'Authorization service returned an invalid response.' },
          { status: 502 },
        );
  } catch {
    return NextResponse.json({ message: 'Authorization service is unavailable.' }, { status: 503 });
  }
}
