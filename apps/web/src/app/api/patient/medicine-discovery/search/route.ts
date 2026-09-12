import { NextRequest, NextResponse } from 'next/server';
import { authApiUrl, boundedUpstreamMessage, noStoreJson, upstreamHeaders } from '@/lib/auth-api';
import { isPatientMedicineSearchResponse } from '@/lib/patient-medicine-search-contract';
import { ACCESS_COOKIE } from '@/lib/session-profile';

export const dynamic = 'force-dynamic';

const allowedKeys = new Set([
  'q',
  'city',
  'state',
  'latitude',
  'longitude',
  'radiusKm',
  'limit',
  'offset',
]);
const latLngPattern = /^-?(?:[0-9]+(?:\.[0-9]{1,10})?|[0-9]{1,2}\.[0-9]{1,10})$/;

/**
 * GET /api/patient/medicine-discovery/search
 *
 * Authenticated patient medicine search. Validation fails closed before any
 * upstream call: unknown keys, malformed coordinates, blank terms, oversized
 * values and unsafe pagination are rejected here. No patient/tenant selector
 * can be supplied because the allowed-key whitelist does not include one.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const parsed = parseSearch(request.nextUrl.searchParams);
  if ('error' in parsed) return noStoreJson({ message: parsed.error }, 400);

  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!accessToken) {
    return noStoreJson({ message: 'Your session has expired. Sign in again.' }, 401);
  }

  const upstreamQuery = new URLSearchParams();
  upstreamQuery.set('q', parsed.q);
  if (parsed.city !== undefined) upstreamQuery.set('city', parsed.city);
  if (parsed.state !== undefined) upstreamQuery.set('state', parsed.state);
  if (parsed.latitude !== undefined) upstreamQuery.set('latitude', String(parsed.latitude));
  if (parsed.longitude !== undefined) upstreamQuery.set('longitude', String(parsed.longitude));
  if (parsed.radiusKm !== undefined) upstreamQuery.set('radiusKm', String(parsed.radiusKm));
  upstreamQuery.set('limit', String(parsed.limit));
  upstreamQuery.set('offset', String(parsed.offset));

  let upstream: Response;
  try {
    upstream = await fetch(
      authApiUrl(`/patient/medicine-discovery/search?${upstreamQuery.toString()}`),
      { headers: upstreamHeaders(request, accessToken), cache: 'no-store' },
    );
  } catch {
    return noStoreJson({ message: 'Medicine search is unavailable right now.' }, 503);
  }
  if (!upstream.ok) {
    const message = await boundedUpstreamMessage(upstream, 'Unable to search medicine.');
    return noStoreJson({ message }, searchUpstreamStatus(upstream.status));
  }
  try {
    const payload: unknown = await upstream.json();
    return isPatientMedicineSearchResponse(payload)
      ? noStoreJson(payload, 200)
      : noStoreJson({ message: 'Medicine search returned an invalid response.' }, 502);
  } catch {
    return noStoreJson({ message: 'Medicine search returned an invalid response.' }, 502);
  }
}
type ParsedSearch =
  | {
      q: string;
      city?: string;
      state?: string;
      latitude?: number;
      longitude?: number;
      radiusKm?: number;
      limit: number;
      offset: number;
    }
  | { error: string };

function parseSearch(search: URLSearchParams): ParsedSearch {
  for (const key of search.keys()) {
    if (!allowedKeys.has(key)) return { error: 'Unsupported search query.' };
    if (search.getAll(key).length !== 1) return { error: 'Duplicate search query value.' };
  }

  const q = search.get('q');
  if (!q || q.trim().length === 0 || q.length > 120) {
    return { error: 'Enter a medicine name to search.' };
  }

  const city = search.get('city');
  if (city !== null && (city.trim().length === 0 || city.length > 120)) {
    return { error: 'Enter a valid city.' };
  }
  const state = search.get('state');
  if (state !== null && (state.trim().length === 0 || state.length > 120)) {
    return { error: 'Enter a valid state.' };
  }
  const rawLatitude = search.get('latitude');
  const rawLongitude = search.get('longitude');
  const latitude = parseCoordinate(rawLatitude);
  const longitude = parseCoordinate(rawLongitude);
  if ((rawLatitude === null) !== (rawLongitude === null)) {
    return { error: 'Provide both latitude and longitude together.' };
  }
  if (
    (rawLatitude !== null && latitude === undefined) ||
    (rawLongitude !== null && longitude === undefined)
  ) {
    return { error: 'Provide valid latitude and longitude values.' };
  }
  if (latitude !== undefined && (latitude < -90 || latitude > 90)) {
    return { error: 'Latitude is outside the supported range.' };
  }
  if (longitude !== undefined && (longitude < -180 || longitude > 180)) {
    return { error: 'Longitude is outside the supported range.' };
  }
  if ((city === null) !== (state === null)) {
    return { error: 'Provide both city and state for a manual area search.' };
  }
  if ((city !== null || state !== null) && (latitude !== undefined || longitude !== undefined)) {
    return { error: 'Choose one location mode: manual area or precise location.' };
  }

  const rawRadiusKm = search.get('radiusKm');
  const radiusKm = parseBoundedInteger(rawRadiusKm, undefined, 1, 50);
  if (radiusKm === null) {
    return { error: 'Invalid search radius.' };
  }
  if (rawRadiusKm !== null && (latitude === undefined || longitude === undefined)) {
    return { error: 'Search radius requires precise latitude and longitude.' };
  }
  const limit = parseBoundedInteger(search.get('limit'), 20, 1, 25);
  const offset = parseBoundedInteger(search.get('offset'), 0, 0, 500);
  if (limit === null || limit === undefined || offset === null || offset === undefined) {
    return { error: 'Invalid search pagination.' };
  }

  return {
    q: q.trim(),
    ...(city !== null ? { city: city.trim() } : {}),
    ...(state !== null ? { state: state.trim() } : {}),
    ...(latitude !== undefined ? { latitude } : {}),
    ...(longitude !== undefined ? { longitude } : {}),
    ...(radiusKm !== undefined ? { radiusKm } : {}),
    limit,
    offset,
  };
}

function parseCoordinate(value: string | null): number | undefined {
  if (value === null) return undefined;
  if (!latLngPattern.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseBoundedInteger(
  value: string | null,
  fallback: number | undefined,
  min: number,
  max: number,
): number | null | undefined {
  if (value === null) return fallback;
  if (!/^(?:0|[1-9]\d*)$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

function searchUpstreamStatus(status: number): number {
  return [401, 403].includes(status) ? status : status >= 500 ? 502 : 400;
}
