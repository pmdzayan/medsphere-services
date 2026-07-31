import { NextRequest, NextResponse } from 'next/server';
import {
  authApiUrl,
  boundedUpstreamMessage,
  publicUpstreamStatus,
  upstreamHeaders,
} from '@/lib/auth-api';
import { isAuditEventPage } from '@/lib/audit-contract';
import { ACCESS_COOKIE } from '@/lib/session-profile';

export const dynamic = 'force-dynamic';

const queryKeys = [
  'eventType',
  'outcome',
  'actorMembershipId',
  'resourceType',
  'resourceId',
  'startDate',
  'endDate',
  'cursor',
  'limit',
] as const;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!accessToken) {
    return noStore({ message: 'Your session has expired. Sign in again.' }, 401);
  }

  const search = new URLSearchParams();
  for (const key of queryKeys) {
    const value = request.nextUrl.searchParams.get(key);
    if (value !== null) search.set(key, value);
  }

  let upstream: Response;
  try {
    upstream = await fetch(authApiUrl(`/audit/events?${search.toString()}`), {
      headers: upstreamHeaders(request, accessToken),
      cache: 'no-store',
    });
  } catch {
    return noStore({ message: 'Audit service is unavailable.' }, 503);
  }

  if (!upstream.ok) {
    const message = await boundedUpstreamMessage(upstream, 'Unable to load audit events.');
    return noStore({ message }, publicUpstreamStatus(upstream.status));
  }

  try {
    const payload: unknown = await upstream.json();
    if (!isAuditEventPage(payload)) throw new Error('Invalid audit event contract');
    return noStore(payload, 200);
  } catch {
    return noStore({ message: 'Audit service returned an invalid response.' }, 502);
  }
}

function noStore(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { 'cache-control': 'no-store' },
  });
}
