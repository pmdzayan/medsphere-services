import { NextRequest, NextResponse } from 'next/server';
import {
  authApiUrl,
  boundedUpstreamMessage,
  isSameOriginMutation,
  noStoreJson,
  upstreamHeaders,
} from '@/lib/auth-api';
import {
  isCreatePatientReservationRequest,
  isCreatePatientReservationResponse,
  isPatientReservationPage,
  PATIENT_RESERVATION_STATUSES,
  type PatientReservationStatus,
} from '@/lib/patient-reservation-contract';
import { ACCESS_COOKIE } from '@/lib/session-profile';

export const dynamic = 'force-dynamic';

const allowedKeys = new Set(['status', 'limit', 'offset']);

/**
 * GET /api/patient/medicine-reservations
 *
 * Lists ONLY the authenticated patient's own reservations. No client-supplied
 * ownership selector exists in the whitelist; the access token drives the
 * upstream call and the backend scopes by authenticated identity.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const parsed = parseListQuery(request.nextUrl.searchParams);
  if ('error' in parsed) return noStoreJson({ message: parsed.error }, 400);

  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!accessToken) {
    return noStoreJson({ message: 'Your session has expired. Sign in again.' }, 401);
  }

  const query = new URLSearchParams();
  if (parsed.status !== undefined) query.set('status', parsed.status);
  query.set('limit', String(parsed.limit));
  query.set('offset', String(parsed.offset));

  let upstream: Response;
  try {
    upstream = await fetch(authApiUrl(`/patient/reservations?${query.toString()}`), {
      headers: upstreamHeaders(request, accessToken),
      cache: 'no-store',
    });
  } catch {
    return noStoreJson({ message: 'Reservation service is unavailable.' }, 503);
  }
  if (!upstream.ok) {
    const message = await boundedUpstreamMessage(upstream, 'Unable to load your reservations.');
    return noStoreJson({ message }, reservationUpstreamStatus(upstream.status));
  }
  try {
    const payload: unknown = await upstream.json();
    return isPatientReservationPage(payload)
      ? noStoreJson(payload, 200)
      : noStoreJson({ message: 'Reservation service returned an invalid response.' }, 502);
  } catch {
    return noStoreJson({ message: 'Reservation service returned an invalid response.' }, 502);
  }
}

/**
 * POST /api/patient/medicine-reservations
 *
 * Same-origin-guarded create. The body must contain exactly providerId
 * (the pharmacy where the patient is reserving), a bounded item list, an
 * optional expiry and an idempotency key. Ownership identity is never
 * accepted; the access token provides it. The providerId is forwarded as an
 * upstream path segment exactly like the backend contract.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isSameOriginMutation(request)) {
    return noStoreJson({ message: 'Cross-origin request rejected.' }, 403);
  }
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!accessToken) {
    return noStoreJson({ message: 'Your session has expired. Sign in again.' }, 401);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return noStoreJson({ message: 'A valid reservation is required.' }, 400);
  }
  if (!isCreatePatientReservationRequest(body)) {
    return noStoreJson({ message: 'A valid reservation is required.' }, 400);
  }
  const { providerId, ...createBody } = body;

  let upstream: Response;
  try {
    const headers = upstreamHeaders(request, accessToken);
    headers.set('content-type', 'application/json');
    upstream = await fetch(
      authApiUrl(`/patient/reservations/providers/${encodeURIComponent(providerId)}`),
      {
        method: 'POST',
        headers,
        body: JSON.stringify(createBody),
        cache: 'no-store',
      },
    );
  } catch {
    return noStoreJson({ message: 'Reservation service is unavailable.' }, 503);
  }
  if (!upstream.ok) {
    const message = await boundedUpstreamMessage(upstream, 'Unable to create the reservation.');
    return noStoreJson({ message }, reservationUpstreamStatus(upstream.status));
  }
  try {
    const payload: unknown = await upstream.json();
    return isCreatePatientReservationResponse(payload)
      ? noStoreJson(payload, 200)
      : noStoreJson({ message: 'Reservation service returned an invalid response.' }, 502);
  } catch {
    return noStoreJson({ message: 'Reservation service returned an invalid response.' }, 502);
  }
}

type ParsedList =
  { status?: PatientReservationStatus; limit: number; offset: number } | { error: string };

function parseListQuery(search: URLSearchParams): ParsedList {
  for (const key of search.keys()) {
    if (!allowedKeys.has(key)) return { error: 'Unsupported reservation query.' };
    if (search.getAll(key).length !== 1) return { error: 'Duplicate reservation query value.' };
  }
  const rawStatus = search.get('status');
  const status = rawStatus === null ? undefined : (rawStatus as PatientReservationStatus);
  if (status && !PATIENT_RESERVATION_STATUSES.includes(status)) {
    return { error: 'Invalid reservation status.' };
  }
  const limit = parseInteger(search.get('limit'), 20, 1, 25);
  const offset = parseInteger(search.get('offset'), 0, 0, 500);
  if (limit === null || offset === null) return { error: 'Invalid reservation pagination.' };
  return { status, limit, offset };
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

function reservationUpstreamStatus(status: number): number {
  return [401, 403, 404, 409].includes(status) ? status : status >= 500 ? 502 : 400;
}
