import { NextRequest, NextResponse } from 'next/server';
import { authApiUrl, boundedUpstreamMessage, noStoreJson, upstreamHeaders } from '@/lib/auth-api';
import { isListPatientNotificationsResponse } from '@/lib/patient-notification-contract';
import { ACCESS_COOKIE } from '@/lib/session-profile';

export const dynamic = 'force-dynamic';

const ALLOWED_QUERY_KEYS = ['cursor', 'unreadOnly'];
const CURSOR_MAX_LENGTH = 200;

/**
 * Forwards to the backend's self-service GET /patient/notifications, scoped exclusively by the
 * server-verified access token -- this route never accepts or
 * forwards any client-supplied recipient/user identifier. The BFF
 * itself -- not only the backend's NestJS DTO -- fails closed on any
 * unexpected query key, duplicate occurrence, or malformed value
 * BEFORE the upstream fetch is ever made.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!accessToken) {
    return noStoreJson({ message: 'Your session has expired. Sign in again.' }, 401);
  }

  const searchParams = request.nextUrl.searchParams;
  const presentKeys = Array.from(new Set(searchParams.keys()));
  const unexpectedKey = presentKeys.find((key) => !ALLOWED_QUERY_KEYS.includes(key));
  if (unexpectedKey) {
    return noStoreJson({ message: 'Unsupported query parameter.' }, 400);
  }
  for (const key of ALLOWED_QUERY_KEYS) {
    if (searchParams.getAll(key).length > 1) {
      return noStoreJson({ message: 'Duplicate query parameter.' }, 400);
    }
  }

  const cursor = searchParams.get('cursor');
  if (cursor !== null && (cursor.length === 0 || cursor.length > CURSOR_MAX_LENGTH)) {
    return noStoreJson({ message: 'Invalid pagination cursor.' }, 400);
  }

  const unreadOnlyRaw = searchParams.get('unreadOnly');
  if (unreadOnlyRaw !== null && unreadOnlyRaw !== 'true' && unreadOnlyRaw !== 'false') {
    return noStoreJson({ message: 'Invalid unreadOnly value.' }, 400);
  }

  const upstreamQuery = new URLSearchParams();
  if (cursor) upstreamQuery.set('cursor', cursor);
  if (unreadOnlyRaw !== null) upstreamQuery.set('unreadOnly', unreadOnlyRaw);

  let upstream: Response;
  try {
    upstream = await fetch(authApiUrl(`/patient/notifications?${upstreamQuery.toString()}`), {
      headers: upstreamHeaders(request, accessToken),
      cache: 'no-store',
    });
  } catch {
    return noStoreJson({ message: 'Notifications service is unavailable.' }, 503);
  }

  if (!upstream.ok) {
    const message = await boundedUpstreamMessage(upstream, 'Could not load your notifications.');
    return noStoreJson({ message }, mapUpstreamErrorStatus(upstream.status));
  }

  let payload: unknown;
  try {
    payload = await upstream.json();
  } catch {
    return noStoreJson({ message: 'Notifications service returned an invalid response.' }, 502);
  }
  if (!isListPatientNotificationsResponse(payload)) {
    return noStoreJson({ message: 'Notifications service returned an invalid response.' }, 502);
  }
  return noStoreJson(payload, 200);
}

function mapUpstreamErrorStatus(status: number): number {
  if ([400, 401, 403, 404].includes(status)) return status;
  // A genuine upstream 5xx, or any other unexpected status, is
  // reported as a bad-gateway-shaped failure -- distinct from a local
  // network/fetch failure, which is reported as 503 above.
  return 502;
}
