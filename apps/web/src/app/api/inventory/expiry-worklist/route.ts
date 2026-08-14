import { NextRequest, NextResponse } from 'next/server';
import { authApiUrl, boundedUpstreamMessage, upstreamHeaders } from '@/lib/auth-api';
import { isCanonicalUuid, isInventoryExpiryWorklistPage } from '@/lib/inventory-contract';
import { ACCESS_COOKIE } from '@/lib/session-profile';

export const dynamic = 'force-dynamic';
const allowedKeys = new Set(['providerId', 'horizonDays', 'limit', 'offset']);

export async function GET(request: NextRequest): Promise<NextResponse> {
  const parsed = parseQuery(request.nextUrl.searchParams);
  if ('error' in parsed) return privateNoStore({ message: parsed.error }, 400);
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!accessToken) {
    return privateNoStore({ message: 'Your session has expired. Sign in again.' }, 401);
  }
  const query = new URLSearchParams({
    horizonDays: String(parsed.horizonDays),
    limit: String(parsed.limit),
    offset: String(parsed.offset),
  });
  try {
    const upstream = await fetch(
      authApiUrl(
        `/inventory/providers/${encodeURIComponent(parsed.providerId)}/expiry-worklist?${query}`,
      ),
      { headers: upstreamHeaders(request, accessToken), cache: 'no-store' },
    );
    if (!upstream.ok) {
      const message = await boundedUpstreamMessage(upstream, 'Unable to load expiry worklist.');
      return privateNoStore({ message }, upstreamStatus(upstream.status));
    }
    const payload: unknown = await upstream.json();
    return isInventoryExpiryWorklistPage(payload, parsed.horizonDays)
      ? privateNoStore(payload, 200)
      : privateNoStore({ message: 'Expiry service returned an invalid response.' }, 502);
  } catch {
    return privateNoStore({ message: 'Expiry service is unavailable.' }, 503);
  }
}

function parseQuery(search: URLSearchParams) {
  for (const key of search.keys()) {
    if (!allowedKeys.has(key)) return { error: 'Unsupported expiry query.' } as const;
    if (search.getAll(key).length !== 1) return { error: 'Duplicate expiry query value.' } as const;
  }
  const providerId = search.get('providerId');
  if (!isCanonicalUuid(providerId)) return { error: 'A valid provider is required.' } as const;
  const horizonDays = boundedInteger(search.get('horizonDays'), 30, 1, 365);
  const limit = boundedInteger(search.get('limit'), 25, 1, 100);
  const offset = boundedInteger(search.get('offset'), 0, 0, 10_000);
  if (horizonDays === null || limit === null || offset === null) {
    return { error: 'Invalid expiry worklist bounds.' } as const;
  }
  return { providerId, horizonDays, limit, offset };
}

function boundedInteger(value: string | null, fallback: number, min: number, max: number) {
  if (value === null) return fallback;
  if (!/^(?:0|[1-9]\d*)$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

function upstreamStatus(status: number): number {
  return [401, 403, 404].includes(status) ? status : status >= 500 ? 502 : 400;
}

function privateNoStore(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, { status, headers: { 'cache-control': 'private, no-store' } });
}
