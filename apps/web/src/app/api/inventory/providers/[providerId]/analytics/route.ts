import { NextRequest, NextResponse } from 'next/server';
import { authApiUrl, boundedUpstreamMessage, upstreamHeaders } from '@/lib/auth-api';
import { isCanonicalUuid } from '@/lib/inventory-contract';
import {
  isInventoryAnalyticsResponse,
  NEAR_EXPIRY_HORIZONS,
} from '@/lib/inventory-analytics-contract';
import { ACCESS_COOKIE } from '@/lib/session-profile';

export const dynamic = 'force-dynamic';

const ALLOWED_QUERY_KEYS = ['nearExpiryHorizonDays'];

/**
 * Candidate Task 0038 (PROVISIONAL). Forwards to the backend's own
 * self-service GET /inventory/providers/:providerId/analytics, scoped
 * exclusively by the server-verified access token and an
 * authenticated-session-derived identity -- this route never accepts
 * or forwards any client-supplied tenantId/userId/membershipId, and
 * providerId is taken only from the route parameter, never a query
 * key or body field. Matches this module's existing inventory BFF
 * convention (private, no-store; isCanonicalUuid) rather than the
 * separate patient-BFF convention used elsewhere in this repository.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ providerId: string }> },
): Promise<NextResponse> {
  const { providerId } = await context.params;
  if (!isCanonicalUuid(providerId)) {
    return privateNoStore({ message: 'A valid provider identifier is required.' }, 400);
  }
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!accessToken) {
    return privateNoStore({ message: 'Your session has expired. Sign in again.' }, 401);
  }

  const searchParams = request.nextUrl.searchParams;
  const presentKeys = Array.from(new Set(searchParams.keys()));
  const unexpectedKey = presentKeys.find((key) => !ALLOWED_QUERY_KEYS.includes(key));
  if (unexpectedKey) {
    return privateNoStore({ message: 'Unsupported query parameter.' }, 400);
  }
  if (searchParams.getAll('nearExpiryHorizonDays').length > 1) {
    return privateNoStore({ message: 'Duplicate query parameter.' }, 400);
  }

  const horizonRaw = searchParams.get('nearExpiryHorizonDays');
  let horizon: number | undefined;
  if (horizonRaw !== null) {
    // Exact allowlist -- never silently normalize/round/clamp a
    // malformed or unsupported horizon. "30.5", "-30", "0", "365",
    // and non-numeric strings are all rejected, not coerced. "07" is
    // ALSO rejected even though Number("07") === 7 is itself a valid
    // catalogue value: requiring the string to round-trip exactly
    // back to itself rejects any non-canonical representation of a
    // valid number, not just numbers outside the catalogue.
    if (!/^\d+$/.test(horizonRaw)) {
      return privateNoStore({ message: 'Invalid expiry horizon.' }, 400);
    }
    const parsed = Number(horizonRaw);
    if (String(parsed) !== horizonRaw) {
      return privateNoStore({ message: 'Invalid expiry horizon.' }, 400);
    }
    if (!(NEAR_EXPIRY_HORIZONS as readonly number[]).includes(parsed)) {
      return privateNoStore({ message: 'Invalid expiry horizon.' }, 400);
    }
    horizon = parsed;
  }

  const upstreamQuery = new URLSearchParams();
  if (horizon !== undefined) upstreamQuery.set('nearExpiryHorizonDays', String(horizon));

  let upstream: Response;
  try {
    upstream = await fetch(
      authApiUrl(
        `/inventory/providers/${encodeURIComponent(providerId)}/analytics?${upstreamQuery.toString()}`,
      ),
      { headers: upstreamHeaders(request, accessToken), cache: 'no-store' },
    );
  } catch {
    return privateNoStore({ message: 'Analytics service is unavailable.' }, 503);
  }

  if (!upstream.ok) {
    const message = await boundedUpstreamMessage(upstream, 'Could not load pharmacy analytics.');
    return privateNoStore({ message }, mapUpstreamErrorStatus(upstream.status));
  }

  let payload: unknown;
  try {
    payload = await upstream.json();
  } catch {
    return privateNoStore({ message: 'Analytics service returned an invalid response.' }, 502);
  }
  if (!isInventoryAnalyticsResponse(payload)) {
    return privateNoStore({ message: 'Analytics service returned an invalid response.' }, 502);
  }
  return privateNoStore(payload, 200);
}

function mapUpstreamErrorStatus(status: number): number {
  if ([400, 401, 403, 404].includes(status)) return status;
  return 502;
}

function privateNoStore(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, { status, headers: { 'cache-control': 'private, no-store' } });
}
