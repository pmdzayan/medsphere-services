import { NextRequest, NextResponse } from 'next/server';
import { authApiUrl, boundedUpstreamMessage, upstreamHeaders } from '@/lib/auth-api';
import { isCanonicalUuid, isInventoryStockPage } from '@/lib/inventory-contract';
import { ACCESS_COOKIE } from '@/lib/session-profile';

export const dynamic = 'force-dynamic';

const allowedKeys = new Set(['providerId', 'query', 'limit', 'offset']);

export async function GET(request: NextRequest): Promise<NextResponse> {
  const parsed = parseQuery(request.nextUrl.searchParams);
  if ('error' in parsed) return privateNoStore({ message: parsed.error }, 400);

  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!accessToken) {
    return privateNoStore({ message: 'Your session has expired. Sign in again.' }, 401);
  }

  const upstreamQuery = new URLSearchParams();
  if (parsed.query) upstreamQuery.set('query', parsed.query);
  upstreamQuery.set('limit', String(parsed.limit));
  upstreamQuery.set('offset', String(parsed.offset));

  let upstream: Response;
  try {
    upstream = await fetch(
      authApiUrl(
        `/inventory/providers/${encodeURIComponent(parsed.providerId)}/stock?${upstreamQuery.toString()}`,
      ),
      { headers: upstreamHeaders(request, accessToken), cache: 'no-store' },
    );
  } catch {
    return privateNoStore({ message: 'Inventory service is unavailable.' }, 503);
  }
  if (!upstream.ok) {
    const message = await boundedUpstreamMessage(upstream, 'Unable to load provider stock.');
    return privateNoStore({ message }, inventoryUpstreamStatus(upstream.status));
  }
  try {
    const payload: unknown = await upstream.json();
    return isInventoryStockPage(payload)
      ? privateNoStore(payload, 200)
      : privateNoStore({ message: 'Inventory service returned an invalid response.' }, 502);
  } catch {
    return privateNoStore({ message: 'Inventory service returned an invalid response.' }, 502);
  }
}

function parseQuery(
  search: URLSearchParams,
): { providerId: string; query?: string; limit: number; offset: number } | { error: string } {
  for (const key of search.keys()) {
    if (!allowedKeys.has(key)) return { error: 'Unsupported inventory query.' };
    if (search.getAll(key).length !== 1) return { error: 'Duplicate inventory query value.' };
  }
  const providerId = search.get('providerId');
  if (!isCanonicalUuid(providerId)) return { error: 'A valid provider is required.' };
  const query = search.get('query') ?? undefined;
  if (query !== undefined && query.length > 120) return { error: 'Search is too long.' };
  const limit = parseBoundedInteger(search.get('limit'), 25, 1, 100);
  const offset = parseBoundedInteger(search.get('offset'), 0, 0, 10_000);
  if (limit === null || offset === null) return { error: 'Invalid inventory pagination.' };
  return { providerId, query, limit, offset };
}

function parseBoundedInteger(
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

function inventoryUpstreamStatus(status: number): number {
  return [401, 403, 404].includes(status) ? status : status >= 500 ? 502 : 400;
}

function privateNoStore(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { 'cache-control': 'private, no-store' },
  });
}
