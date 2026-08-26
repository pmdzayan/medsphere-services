import { NextRequest, NextResponse } from 'next/server';
import { authApiUrl, boundedUpstreamMessage, upstreamHeaders } from '@/lib/auth-api';
import { isPublicNearbyMedicineSearchResponse } from '@/lib/public-medicine-search-contract';

export const dynamic = 'force-dynamic';

const allowedKeys = new Set(['q', 'latitude', 'longitude', 'radiusKm', 'limit', 'offset']);

export async function GET(request: NextRequest): Promise<NextResponse> {
  const parsed = parseQuery(request.nextUrl.searchParams);

  if ('error' in parsed) {
    return noStore({ message: parsed.error }, 400);
  }

  const upstreamQuery = new URLSearchParams({
    q: parsed.q,
    latitude: String(parsed.latitude),
    longitude: String(parsed.longitude),
    radiusKm: String(parsed.radiusKm),
    limit: String(parsed.limit),
    offset: String(parsed.offset),
  });

  let upstream: Response;

  try {
    // Public patient-facing endpoint. Deliberately do not forward
    // access tokens, cookies, or authenticated session state.
    upstream = await fetch(
      authApiUrl(`/public/medicine-discovery/nearby?${upstreamQuery.toString()}`),
      {
        headers: upstreamHeaders(request),
        cache: 'no-store',
      },
    );
  } catch {
    return noStore({ message: 'Nearby search is unavailable right now.' }, 503);
  }

  if (!upstream.ok) {
    const message = await boundedUpstreamMessage(
      upstream,
      'Unable to search nearby medicine availability.',
    );

    return noStore(
      { message },
      upstream.status >= 500 ? 502 : upstream.status >= 400 ? upstream.status : 400,
    );
  }

  try {
    const payload: unknown = await upstream.json();

    return isPublicNearbyMedicineSearchResponse(payload)
      ? noStore(payload, 200)
      : noStore({ message: 'Nearby search returned an invalid response.' }, 502);
  } catch {
    return noStore({ message: 'Nearby search returned an invalid response.' }, 502);
  }
}

function parseQuery(search: URLSearchParams):
  | {
      q: string;
      latitude: number;
      longitude: number;
      radiusKm: number;
      limit: number;
      offset: number;
    }
  | { error: string } {
  for (const key of search.keys()) {
    if (!allowedKeys.has(key)) {
      return { error: 'Unsupported nearby search query.' };
    }

    if (search.getAll(key).length !== 1) {
      return { error: 'Duplicate nearby search query value.' };
    }
  }

  const q = search.get('q')?.trim() ?? '';
  if (q.length < 1 || q.length > 120) {
    return { error: 'Enter a medicine name to search.' };
  }

  const latitude = parseNumber(search.get('latitude'), -90, 90);
  const longitude = parseNumber(search.get('longitude'), -180, 180);
  const radiusKm = parseNumber(search.get('radiusKm'), 1, 50, 10);
  const limit = parseInteger(search.get('limit'), 1, 25, 20);
  const offset = parseInteger(search.get('offset'), 0, 500, 0);

  if (
    latitude === null ||
    longitude === null ||
    radiusKm === null ||
    limit === null ||
    offset === null
  ) {
    return { error: 'Invalid nearby search location or pagination.' };
  }

  return {
    q,
    latitude,
    longitude,
    radiusKm,
    limit,
    offset,
  };
}

function parseNumber(
  value: string | null,
  min: number,
  max: number,
  fallback?: number,
): number | null {
  if (value === null) return fallback ?? null;
  if (value.trim() === '') return null;

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

function parseInteger(
  value: string | null,
  min: number,
  max: number,
  fallback: number,
): number | null {
  if (value === null) return fallback;
  if (!/^\d+$/.test(value)) return null;

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

function noStore(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { 'cache-control': 'no-store' },
  });
}
