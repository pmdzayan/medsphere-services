import { NextRequest, NextResponse } from 'next/server';
import {
  authApiUrl,
  boundedUpstreamMessage,
  isSameOriginMutation,
  noStoreJson,
  upstreamHeaders,
} from '@/lib/auth-api';
import { isMarkAllReadResponse } from '@/lib/patient-notification-contract';
import { ACCESS_COOKIE } from '@/lib/session-profile';

/**
 * This operation has no parameters beyond the authenticated identity itself. Any non-empty request
 * body (even "{}") is rejected before the upstream fetch, and nothing
 * is ever forwarded upstream.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isSameOriginMutation(request)) {
    return noStoreJson({ message: 'Cross-origin request rejected.' }, 403);
  }
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!accessToken) {
    return noStoreJson({ message: 'Your session has expired. Sign in again.' }, 401);
  }

  // Fails closed on ANY body presence without reading/consuming it --
  // this operation has no request-body contract at all, so an
  // attacker-controlled body (including a large one) is rejected by
  // presence alone, never buffered or parsed.
  if (request.body !== null) {
    return noStoreJson({ message: 'This operation does not accept a request body.' }, 400);
  }

  let upstream: Response;
  try {
    upstream = await fetch(authApiUrl('/patient/notifications/read-all'), {
      method: 'POST',
      headers: upstreamHeaders(request, accessToken),
      cache: 'no-store',
    });
  } catch {
    return noStoreJson({ message: 'Notifications service is unavailable.' }, 503);
  }

  if (!upstream.ok) {
    const message = await boundedUpstreamMessage(upstream, 'Could not update your notifications.');
    return noStoreJson({ message }, mapUpstreamErrorStatus(upstream.status));
  }

  let payload: unknown;
  try {
    payload = await upstream.json();
  } catch {
    return noStoreJson({ message: 'Notifications service returned an invalid response.' }, 502);
  }
  if (!isMarkAllReadResponse(payload)) {
    return noStoreJson({ message: 'Notifications service returned an invalid response.' }, 502);
  }
  return noStoreJson(payload, 200);
}

function mapUpstreamErrorStatus(status: number): number {
  if ([400, 401, 403].includes(status)) return status;
  return 502;
}
