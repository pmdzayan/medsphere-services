import { NextRequest, NextResponse } from 'next/server';
import {
  authApiUrl,
  boundedUpstreamMessage,
  isSameOriginMutation,
  noStoreJson,
  upstreamHeaders,
} from '@/lib/auth-api';
import { isCanonicalUuid } from '@/lib/inventory-contract';
import {
  isCancelPatientReservationRequest,
  isCancelPatientReservationResponse,
} from '@/lib/patient-reservation-contract';
import { ACCESS_COOKIE } from '@/lib/session-profile';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ reservationId: string }> };

/**
 * POST /api/patient/medicine-reservations/:reservationId/cancel
 *
 * Same-origin-guarded patient-initiated cancellation. The reservation must
 * belong to the authenticated patient (backend-scoped by the access token).
 * Version + idempotency anchor mirror the accepted staff lifecycle contract.
 */
export async function POST(request: NextRequest, context: Context): Promise<NextResponse> {
  if (!isSameOriginMutation(request)) {
    return noStoreJson({ message: 'Cross-origin request rejected.' }, 403);
  }
  const { reservationId } = await context.params;
  if (!isCanonicalUuid(reservationId)) {
    return noStoreJson({ message: 'A valid reservation is required.' }, 400);
  }
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!accessToken) {
    return noStoreJson({ message: 'Your session has expired. Sign in again.' }, 401);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return noStoreJson({ message: 'A valid cancellation is required.' }, 400);
  }
  if (!isCancelPatientReservationRequest(body)) {
    return noStoreJson({ message: 'A valid cancellation is required.' }, 400);
  }

  let upstream: Response;
  try {
    const headers = upstreamHeaders(request, accessToken);
    headers.set('content-type', 'application/json');
    upstream = await fetch(
      authApiUrl(`/patient/reservations/${encodeURIComponent(reservationId)}/cancel`),
      {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        cache: 'no-store',
      },
    );
  } catch {
    return noStoreJson({ message: 'Reservation service is unavailable.' }, 503);
  }
  if (!upstream.ok) {
    const message = await boundedUpstreamMessage(upstream, 'Unable to cancel the reservation.');
    return noStoreJson({ message }, reservationUpstreamStatus(upstream.status));
  }
  try {
    const payload: unknown = await upstream.json();
    return isCancelPatientReservationResponse(payload)
      ? noStoreJson(payload, 200)
      : noStoreJson({ message: 'Reservation service returned an invalid response.' }, 502);
  } catch {
    return noStoreJson({ message: 'Reservation service returned an invalid response.' }, 502);
  }
}

function reservationUpstreamStatus(status: number): number {
  return [401, 403, 404, 409].includes(status) ? status : status >= 500 ? 502 : 400;
}
