import { NextRequest, NextResponse } from 'next/server';
import { authApiUrl, boundedUpstreamMessage, upstreamHeaders } from '@/lib/auth-api';
import { isInventoryCatalogResponse } from '@/lib/inventory-import-contract';
import { isCanonicalUuid } from '@/lib/inventory-contract';
import { ACCESS_COOKIE } from '@/lib/session-profile';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ providerId: string }> };
const allowedKeys = new Set(['identifier', 'query', 'limit']);

export async function GET(request: NextRequest, context: Context): Promise<NextResponse> {
  const { providerId } = await context.params;
  if (!isCanonicalUuid(providerId)) {
    return privateNoStore({ message: 'A valid provider identifier is required.' }, 400);
  }
  for (const key of request.nextUrl.searchParams.keys()) {
    if (!allowedKeys.has(key) || request.nextUrl.searchParams.getAll(key).length !== 1) {
      return privateNoStore({ message: 'Unsupported catalogue query.' }, 400);
    }
  }

  const identifier = request.nextUrl.searchParams.get('identifier');
  const query = request.nextUrl.searchParams.get('query');
  if (Boolean(identifier) === Boolean(query)) {
    return privateNoStore({ message: 'Provide exactly one catalogue lookup.' }, 400);
  }
  if (identifier !== null && (identifier !== identifier.trim() || identifier.length > 64)) {
    return privateNoStore({ message: 'Invalid product identifier.' }, 400);
  }
  if (query !== null && (query !== query.trim() || query.length < 2 || query.length > 120)) {
    return privateNoStore({ message: 'Invalid catalogue search.' }, 400);
  }
  const limitRaw = request.nextUrl.searchParams.get('limit');
  if (limitRaw !== null && !/^(?:[1-9]|[1-4]\d|50)$/.test(limitRaw)) {
    return privateNoStore({ message: 'Invalid catalogue result limit.' }, 400);
  }

  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!accessToken) {
    return privateNoStore({ message: 'Your session has expired. Sign in again.' }, 401);
  }

  const search = new URLSearchParams();
  if (identifier) search.set('identifier', identifier);
  if (query) search.set('query', query);
  if (limitRaw) search.set('limit', limitRaw);

  try {
    const upstream = await fetch(
      authApiUrl(
        `/inventory/providers/${encodeURIComponent(providerId)}/catalog?${search.toString()}`,
      ),
      { headers: upstreamHeaders(request, accessToken), cache: 'no-store' },
    );
    if (!upstream.ok) {
      const message = await boundedUpstreamMessage(
        upstream,
        'Unable to search medicine catalogue.',
      );
      return privateNoStore({ message }, upstreamStatus(upstream.status));
    }
    const payload: unknown = await upstream.json();
    return isInventoryCatalogResponse(payload)
      ? privateNoStore(payload, 200)
      : privateNoStore({ message: 'Catalogue service returned an invalid response.' }, 502);
  } catch {
    return privateNoStore({ message: 'Catalogue service is unavailable.' }, 503);
  }
}

function upstreamStatus(status: number): number {
  return [401, 403, 404].includes(status) ? status : status >= 500 ? 502 : 400;
}

function privateNoStore(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, { status, headers: { 'cache-control': 'private, no-store' } });
}
