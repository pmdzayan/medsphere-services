import { NextRequest, NextResponse } from 'next/server';
import { authApiUrl, boundedUpstreamMessage, noStoreJson, upstreamHeaders } from '@/lib/auth-api';
import { isCanonicalUuid } from '@/lib/inventory-contract';
import { isPatientReservation } from '@/lib/patient-reservation-contract';
import { ACCESS_COOKIE } from '@/lib/session-profile';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ reservationId: string }> };

/**
 * GET /api/patient/medicine-reservations/:reservationId
 *
 * Reads ONE of the authenticated patient's own reservations. The caller may
 * select a reservation id but never an owner identity; the backend scopes by
 * the access token and returns not-found for any other patient's reservation.
 */
export async function GET(request: NextRequest, context: Context): Promise<NextResponse> {
  const { reservationId } = await context.params;
  if (!isCanonicalUuid(reservationId)) {
    return noStoreJson({ message: 'A valid reservation is required.' }, 400);
  }
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!accessToken) {
    return noStoreJson({ message: 'Your session has expired. Sign in again.' }, 401);
  }

  let upstream: Response;
  try {
    upstream = await fetch(
      authApiUrl(`/patient/reservations/${encodeURIComponent(reservationId)}`),
      { headers: upstreamHeaders(request, accessToken), cache: 'no-store' },
    );
  } catch {
    return noStoreJson({ message: 'Reservation service is unavailable.' }, 503);
  }
  if (!upstream.ok) {
    const message = await boundedUpstreamMessage(upstream, 'Reservation not found.');
    return noStoreJson({ message }, reservationUpstreamStatus(upstream.status));
  }
  try {
    const payload: unknown = await upstream.json();
    return isPatientReservation(payload)
      ? noStoreJson(payload, 200)
      : noStoreJson({ message: 'Reservation service returned an invalid response.' }, 502);
  } catch {
    return noStoreJson({ message: 'Reservation service returned an invalid response.' }, 502);
  }
}

function reservationUpstreamStatus(status: number): number {
  return [401, 403, 404].includes(status) ? status : status >= 500 ? 502 : 400;
}
