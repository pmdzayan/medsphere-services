import { NextRequest, NextResponse } from 'next/server';
import { authApiUrl, boundedUpstreamMessage, upstreamHeaders } from '@/lib/auth-api';
import { isPublicMedicineSearchResponse } from '@/lib/public-medicine-search-contract';

export const dynamic = 'force-dynamic';

const allowedKeys = new Set(['providerId', 'q', 'limit', 'offset']);
const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

type Context = { params: Promise<{ providerId: string }> };

export async function GET(request: NextRequest, context: Context): Promise<NextResponse> {
  const { providerId: rawProviderId } = await context.params;
  const parsed = parseQuery(request.nextUrl.searchParams, rawProviderId);
  if ('error' in parsed) return noStore({ message: parsed.error }, 400);

  const upstreamQuery = new URLSearchParams();
  upstreamQuery.set('q', parsed.q);
  upstreamQuery.set('limit', String(parsed.limit));
  upstreamQuery.set('offset', String(parsed.offset));

  let upstream: Response;
  try {
    // Deliberately no access token -- this is an unauthenticated, public,
    // patient-facing search. Never forward a cookie/session here.
    upstream = await fetch(
      authApiUrl(
        `/public/providers/${encodeURIComponent(parsed.providerId)}/medicine-search?${upstreamQuery.toString()}`,
      ),
      { headers: upstreamHeaders(request), cache: 'no-store' },
    );
  } catch {
    return noStore({ message: 'Search is unavailable right now.' }, 503);
  }
  if (!upstream.ok) {
    const message = await boundedUpstreamMessage(upstream, 'Unable to search medicine.');
    return noStore({ message }, upstream.status === 404 ? 404 : upstream.status >= 500 ? 502 : 400);
  }
  try {
    const payload: unknown = await upstream.json();
    return isPublicMedicineSearchResponse(payload)
      ? noStore(payload, 200)
      : noStore({ message: 'Search returned an invalid response.' }, 502);
  } catch {
    return noStore({ message: 'Search returned an invalid response.' }, 502);
  }
}

function parseQuery(
  search: URLSearchParams,
  providerId: string,
): { providerId: string; q: string; limit: number; offset: number } | { error: string } {
  for (const key of search.keys()) {
    if (!allowedKeys.has(key)) return { error: 'Unsupported search query.' };
    if (search.getAll(key).length !== 1) return { error: 'Duplicate search query value.' };
  }
  if (typeof providerId !== 'string' || !uuidV4.test(providerId)) {
    return { error: 'A valid provider is required.' };
  }
  const q = search.get('q');
  if (!q || q.trim().length === 0 || q.length > 120) {
    return { error: 'Enter a medicine name to search.' };
  }
  const limit = parseBoundedInteger(search.get('limit'), 20, 1, 25);
  const offset = parseBoundedInteger(search.get('offset'), 0, 0, 500);
  if (limit === null || offset === null) return { error: 'Invalid search pagination.' };
  return { providerId, q, limit, offset };
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

function noStore(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, { status, headers: { 'cache-control': 'no-store' } });
}
