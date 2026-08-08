import { NextRequest, NextResponse } from 'next/server';
import { authApiUrl, boundedUpstreamMessage, upstreamHeaders } from '@/lib/auth-api';
import { isCanonicalUuid } from '@/lib/inventory-contract';
import {
  isProviderReservationPage,
  RESERVATION_STATUSES,
  type ReservationStatus,
} from '@/lib/reservation-contract';
import { ACCESS_COOKIE } from '@/lib/session-profile';

export const dynamic = 'force-dynamic';

const allowedKeys = new Set(['providerId', 'status', 'limit', 'offset']);

export async function GET(request: NextRequest): Promise<NextResponse> {
  const parsed = parseQuery(request.nextUrl.searchParams);
  if ('error' in parsed) return privateNoStore({ message: parsed.error }, 400);
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!accessToken)
    return privateNoStore({ message: 'Your session has expired. Sign in again.' }, 401);

  const query = new URLSearchParams({ limit: String(parsed.limit), offset: String(parsed.offset) });
  if (parsed.status) query.set('status', parsed.status);
  let upstream: Response;
  try {
    upstream = await fetch(
      authApiUrl(
        `/inventory/providers/${encodeURIComponent(parsed.providerId)}/reservations?${query}`,
      ),
      { headers: upstreamHeaders(request, accessToken), cache: 'no-store' },
    );
  } catch {
    return privateNoStore({ message: 'Reservation service is unavailable.' }, 503);
  }
  if (!upstream.ok) {
    const message = await boundedUpstreamMessage(upstream, 'Unable to load provider reservations.');
    return privateNoStore({ message }, publicStatus(upstream.status));
  }
  try {
    const payload: unknown = await upstream.json();
    return isProviderReservationPage(payload)
      ? privateNoStore(payload, 200)
      : privateNoStore({ message: 'Reservation service returned an invalid response.' }, 502);
  } catch {
    return privateNoStore({ message: 'Reservation service returned an invalid response.' }, 502);
  }
}

function parseQuery(
  search: URLSearchParams,
):
  | { providerId: string; status?: ReservationStatus; limit: number; offset: number }
  | { error: string } {
  for (const key of search.keys()) {
    if (!allowedKeys.has(key)) return { error: 'Unsupported reservation query.' };
    if (search.getAll(key).length !== 1) return { error: 'Duplicate reservation query value.' };
  }
  const providerId = search.get('providerId');
  if (!isCanonicalUuid(providerId)) return { error: 'A valid provider is required.' };
  const rawStatus = search.get('status');
  const status = rawStatus === null ? undefined : (rawStatus as ReservationStatus);
  if (status && !RESERVATION_STATUSES.includes(status))
    return { error: 'Invalid reservation status.' };
  const limit = parseInteger(search.get('limit'), 25, 1, 100);
  const offset = parseInteger(search.get('offset'), 0, 0, 10_000);
  if (limit === null || offset === null) return { error: 'Invalid reservation pagination.' };
  return { providerId, status, limit, offset };
}

function parseInteger(
  value: string | null,
  fallback: number,
  min: number,
  max: number,
): number | null {
  if (value === null) return fallback;
  if (!/^(?:0|[1-9]\d*)$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

function publicStatus(status: number): number {
  return [401, 403, 404].includes(status) ? status : status >= 500 ? 502 : 400;
}

function privateNoStore(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, { status, headers: { 'cache-control': 'private, no-store' } });
}
