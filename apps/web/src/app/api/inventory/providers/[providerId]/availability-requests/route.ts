import { NextRequest, NextResponse } from 'next/server';
import { authApiUrl, boundedUpstreamMessage, upstreamHeaders } from '@/lib/auth-api';
import { isAvailabilityRequestQueuePage } from '@/lib/availability-request-contract';
import { isCanonicalUuid } from '@/lib/inventory-contract';
import { ACCESS_COOKIE } from '@/lib/session-profile';

type Context = { params: Promise<{ providerId: string }> };

export async function GET(request: NextRequest, context: Context): Promise<NextResponse> {
  const { providerId } = await context.params;
  if (!isCanonicalUuid(providerId)) return privateNoStore({ message: 'Valid provider identifier required.' }, 400);
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!accessToken) return privateNoStore({ message: 'Your session has expired. Sign in again.' }, 401);

  const limit = boundedInt(request.nextUrl.searchParams.get('limit'), 25, 1, 50);
  const offset = boundedInt(request.nextUrl.searchParams.get('offset'), 0, 0, 10_000);
  if (limit === null || offset === null) return privateNoStore({ message: 'Invalid queue pagination.' }, 400);

  try {
    const search = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    const upstream = await fetch(
      authApiUrl(`/inventory/providers/${encodeURIComponent(providerId)}/availability-requests?${search}`),
      { headers: upstreamHeaders(request, accessToken), cache: 'no-store' },
    );
    if (!upstream.ok) {
      return privateNoStore(
        { message: await boundedUpstreamMessage(upstream, 'Unable to load live availability requests.') },
        upstream.status === 401 || upstream.status === 403 || upstream.status === 404 ? upstream.status : 502,
      );
    }
    const payload: unknown = await upstream.json();
    return isAvailabilityRequestQueuePage(payload)
      ? privateNoStore(payload, 200)
      : privateNoStore({ message: 'Availability service returned an invalid response.' }, 502);
  } catch {
    return privateNoStore({ message: 'Availability service is unavailable.' }, 503);
  }
}

function boundedInt(raw: string | null, fallback: number, min: number, max: number): number | null {
  if (raw === null) return fallback;
  if (!/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= min && value <= max ? value : null;
}
function privateNoStore(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, { status, headers: { 'cache-control': 'private, no-store' } });
}
