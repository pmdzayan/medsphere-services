import { NextRequest, NextResponse } from 'next/server';
import { authApiUrl, boundedUpstreamMessage, upstreamHeaders } from '@/lib/auth-api';
import { isInventoryImportPreview } from '@/lib/inventory-import-contract';
import { isCanonicalUuid } from '@/lib/inventory-contract';
import { ACCESS_COOKIE } from '@/lib/session-profile';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ providerId: string; importJobId: string }> };

export async function GET(request: NextRequest, context: Context): Promise<NextResponse> {
  if ([...request.nextUrl.searchParams.keys()].length > 0) {
    return privateNoStore({ message: 'Unsupported inventory import query.' }, 400);
  }
  const { providerId, importJobId } = await context.params;
  if (!isCanonicalUuid(providerId) || !isCanonicalUuid(importJobId)) {
    return privateNoStore({ message: 'A valid inventory import is required.' }, 400);
  }
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!accessToken) {
    return privateNoStore({ message: 'Your session has expired. Sign in again.' }, 401);
  }

  try {
    const upstream = await fetch(
      authApiUrl(
        `/inventory/providers/${encodeURIComponent(providerId)}/imports/${encodeURIComponent(importJobId)}`,
      ),
      { headers: upstreamHeaders(request, accessToken), cache: 'no-store' },
    );
    if (!upstream.ok) {
      const message = await boundedUpstreamMessage(upstream, 'Unable to load inventory import.');
      return privateNoStore({ message }, upstreamStatus(upstream.status));
    }
    const payload: unknown = await upstream.json();
    return isInventoryImportPreview(payload) &&
      payload.providerId === providerId &&
      payload.importJobId === importJobId
      ? privateNoStore(payload, 200)
      : privateNoStore({ message: 'Inventory service returned an invalid response.' }, 502);
  } catch {
    return privateNoStore({ message: 'Inventory service is unavailable.' }, 503);
  }
}

function upstreamStatus(status: number): number {
  return [401, 403, 404].includes(status) ? status : status >= 500 ? 502 : 400;
}

function privateNoStore(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, { status, headers: { 'cache-control': 'private, no-store' } });
}
