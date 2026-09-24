import { NextRequest, NextResponse } from 'next/server';
import {
  authApiUrl,
  boundedUpstreamMessage,
  isSameOriginMutation,
  noStoreJson,
  upstreamHeaders,
} from '@/lib/auth-api';
import { isCanonicalUuid } from '@/lib/inventory-contract';
import { isPatientPickupProof } from '@/lib/patient-reservation-contract';
import { ACCESS_COOKIE } from '@/lib/session-profile';

export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ reservationId: string }> };

export async function POST(request: NextRequest, context: Context): Promise<NextResponse> {
  if (!isSameOriginMutation(request)) return noStoreJson({ message: 'Cross-origin request rejected.' }, 403);
  const { reservationId } = await context.params;
  if (!isCanonicalUuid(reservationId)) return noStoreJson({ message: 'A valid reservation is required.' }, 400);
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!accessToken) return noStoreJson({ message: 'Your session has expired. Sign in again.' }, 401);

  try {
    const upstream = await fetch(
      authApiUrl(`/patient/reservations/${encodeURIComponent(reservationId)}/pickup-proof`),
      { method: 'POST', headers: upstreamHeaders(request, accessToken), cache: 'no-store' },
    );
    if (!upstream.ok) {
      return noStoreJson(
        { message: await boundedUpstreamMessage(upstream, 'Unable to issue pickup proof.') },
        [401,403,404,409].includes(upstream.status) ? upstream.status : upstream.status >= 500 ? 502 : 400,
      );
    }
    const payload: unknown = await upstream.json();
    return isPatientPickupProof(payload)
      ? noStoreJson(payload, 200)
      : noStoreJson({ message: 'Reservation service returned an invalid response.' }, 502);
  } catch {
    return noStoreJson({ message: 'Reservation service is unavailable.' }, 503);
  }
}
