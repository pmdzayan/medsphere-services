import { NextRequest, NextResponse } from 'next/server';
import {
  authApiUrl,
  boundedUpstreamMessage,
  isSameOriginMutation,
  noStoreJson,
  upstreamHeaders,
} from '@/lib/auth-api';
import { isPatientNotification } from '@/lib/patient-notification-contract';
import { isCanonicalUuid } from '@/lib/inventory-contract';
import { ACCESS_COOKIE } from '@/lib/session-profile';

type Context = { params: Promise<{ notificationId: string }> };

/**
 * This operation has no request body contract. Any non-empty body (even "{}", even one
 * attempting userId/recipientUserId/tenantId) is rejected BEFORE the
 * upstream fetch, and nothing is ever forwarded upstream. Only the
 * notificationId in the URL selects WHICH of the caller's own
 * notifications is targeted; the backend independently re-derives the
 * patient identity from the token.
 */
export async function PATCH(request: NextRequest, context: Context): Promise<NextResponse> {
  if (!isSameOriginMutation(request)) {
    return noStoreJson({ message: 'Cross-origin request rejected.' }, 403);
  }
  const { notificationId } = await context.params;
  if (!isCanonicalUuid(notificationId)) {
    return noStoreJson({ message: 'A valid notification identifier is required.' }, 400);
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
    upstream = await fetch(
      authApiUrl(`/patient/notifications/${encodeURIComponent(notificationId)}/read`),
      { method: 'PATCH', headers: upstreamHeaders(request, accessToken), cache: 'no-store' },
    );
  } catch {
    return noStoreJson({ message: 'Notifications service is unavailable.' }, 503);
  }

  if (!upstream.ok) {
    const message = await boundedUpstreamMessage(upstream, 'Could not update this notification.');
    return noStoreJson({ message }, mapUpstreamErrorStatus(upstream.status));
  }

  let payload: unknown;
  try {
    payload = await upstream.json();
  } catch {
    return noStoreJson({ message: 'Notifications service returned an invalid response.' }, 502);
  }
  if (!isPatientNotification(payload)) {
    return noStoreJson({ message: 'Notifications service returned an invalid response.' }, 502);
  }
  return noStoreJson(payload, 200);
}

function mapUpstreamErrorStatus(status: number): number {
  if ([400, 401, 403, 404].includes(status)) return status;
  return 502;
}
