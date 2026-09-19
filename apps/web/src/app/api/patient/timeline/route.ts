import { NextRequest, NextResponse } from 'next/server';
import { authApiUrl, boundedUpstreamMessage, noStoreJson, upstreamHeaders } from '@/lib/auth-api';
import { isListPatientTimelineResponse } from '@/lib/patient-timeline-contract';
import { ACCESS_COOKIE } from '@/lib/session-profile';

export const dynamic = 'force-dynamic';

const ALLOWED_QUERY_KEYS = ['cursor'];
const CURSOR_MAX_LENGTH = 200;

/**
 * Candidate Task 0037 (PROVISIONAL). Forwards to the backend's own
 * self-service GET /patient/timeline, scoped exclusively by the
 * server-verified access token -- this route never accepts or
 * forwards any client-supplied recipient/patient identifier. The BFF
 * itself -- not only the backend's NestJS DTO -- fails closed on any
 * unexpected query key, duplicate occurrence, or malformed value
 * BEFORE the upstream fetch is ever made (matching the strict-BFF
 * pattern hardened in candidate Task 0036).
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
  if (searchParams.getAll('cursor').length > 1) {
    return noStoreJson({ message: 'Duplicate query parameter.' }, 400);
  }

  const cursor = searchParams.get('cursor');
  if (cursor !== null && (cursor.length === 0 || cursor.length > CURSOR_MAX_LENGTH)) {
    return noStoreJson({ message: 'Invalid pagination cursor.' }, 400);
  }

  const upstreamQuery = new URLSearchParams();
  if (cursor) upstreamQuery.set('cursor', cursor);

  let upstream: Response;
  try {
    upstream = await fetch(authApiUrl(`/patient/timeline?${upstreamQuery.toString()}`), {
      headers: upstreamHeaders(request, accessToken),
      cache: 'no-store',
    });
  } catch {
    return noStoreJson({ message: 'Timeline service is unavailable.' }, 503);
  }

  if (!upstream.ok) {
    const message = await boundedUpstreamMessage(upstream, 'Could not load your timeline.');
    return noStoreJson({ message }, mapUpstreamErrorStatus(upstream.status));
  }

  let payload: unknown;
  try {
    payload = await upstream.json();
  } catch {
    return noStoreJson({ message: 'Timeline service returned an invalid response.' }, 502);
  }
  if (!isListPatientTimelineResponse(payload)) {
    return noStoreJson({ message: 'Timeline service returned an invalid response.' }, 502);
  }
  return noStoreJson(payload, 200);
}

function mapUpstreamErrorStatus(status: number): number {
  if ([400, 401, 403, 404].includes(status)) return status;
  return 502;
}
