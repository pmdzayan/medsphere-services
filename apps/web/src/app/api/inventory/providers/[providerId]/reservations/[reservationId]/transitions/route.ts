import { NextRequest, NextResponse } from 'next/server';
import {
  authApiUrl,
  boundedUpstreamMessage,
  isSameOriginMutation,
  upstreamHeaders,
} from '@/lib/auth-api';
import { isCanonicalUuid } from '@/lib/inventory-contract';
import {
  isReservationTransitionRequest,
  isReservationTransitionResponse,
} from '@/lib/reservation-contract';
import { ACCESS_COOKIE } from '@/lib/session-profile';

type Context = { params: Promise<{ providerId: string; reservationId: string }> };

export async function POST(request: NextRequest, context: Context): Promise<NextResponse> {
  if (!isSameOriginMutation(request)) {
    return privateNoStore({ message: 'Cross-origin request rejected.' }, 403);
  }
  const { providerId, reservationId } = await context.params;
  if (!isCanonicalUuid(providerId) || !isCanonicalUuid(reservationId)) {
    return privateNoStore(
      { message: 'Valid provider and reservation identifiers are required.' },
      400,
    );
  }
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!accessToken) {
    return privateNoStore({ message: 'Your session has expired. Sign in again.' }, 401);
  }
  let command: unknown;
  try {
    command = await request.json();
  } catch {
    return privateNoStore({ message: 'A valid reservation transition is required.' }, 400);
  }
  if (!isReservationTransitionRequest(command)) {
    return privateNoStore({ message: 'A valid reservation transition is required.' }, 400);
  }

  try {
    const headers = upstreamHeaders(request, accessToken);
    headers.set('content-type', 'application/json');
    const upstream = await fetch(
      authApiUrl(
        `/inventory/providers/${encodeURIComponent(providerId)}/reservations/${encodeURIComponent(
          reservationId,
        )}/transitions`,
      ),
      { method: 'POST', headers, body: JSON.stringify(command), cache: 'no-store' },
    );
    if (!upstream.ok) {
      const message = await boundedUpstreamMessage(upstream, 'Unable to transition reservation.');
      return privateNoStore({ message }, mutationStatus(upstream.status));
    }
    let receipt: unknown;
    try {
      receipt = await upstream.json();
    } catch {
      return privateNoStore({ message: 'Reservation service returned an invalid response.' }, 502);
    }
    return isReservationTransitionResponse(receipt)
      ? privateNoStore(receipt, 200)
      : privateNoStore({ message: 'Reservation service returned an invalid response.' }, 502);
  } catch {
    return privateNoStore({ message: 'Reservation service is unavailable.' }, 503);
  }
}

function mutationStatus(status: number): number {
  if ([401, 403, 404, 409, 412, 428].includes(status)) return status;
  return status >= 500 ? 502 : 400;
}

function privateNoStore(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, { status, headers: { 'cache-control': 'private, no-store' } });
}
