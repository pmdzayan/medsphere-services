import { NextRequest, NextResponse } from 'next/server';
import {
  authApiUrl,
  boundedUpstreamMessage,
  isSameOriginMutation,
  upstreamHeaders,
} from '@/lib/auth-api';
import { isCanonicalUuid } from '@/lib/inventory-contract';
import {
  isAssignPharmacyStaffRequest,
  isPharmacyStaffCatalogue,
  isProviderAccessAssignment,
} from '@/lib/pharmacy-staff-contract';
import { ACCESS_COOKIE } from '@/lib/session-profile';

type Context = { params: Promise<{ providerId: string }> };

function privateNoStore(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, { status, headers: { 'cache-control': 'private, no-store' } });
}

function upstreamStatus(status: number): number {
  if ([401, 403, 404, 409, 412, 428].includes(status)) return status;
  return status >= 500 ? 502 : 400;
}

export async function GET(request: NextRequest, context: Context): Promise<NextResponse> {
  const { providerId } = await context.params;
  if (!isCanonicalUuid(providerId)) {
    return privateNoStore({ message: 'A valid pharmacy is required.' }, 400);
  }
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!accessToken) {
    return privateNoStore({ message: 'Your session has expired. Sign in again.' }, 401);
  }

  const query = parseListQuery(request.nextUrl.searchParams);
  if (!query) {
    return privateNoStore({ message: 'Invalid staff list query.' }, 400);
  }

  try {
    const upstream = await fetch(
      authApiUrl(
        `/authorization/providers/${encodeURIComponent(providerId)}/memberships?limit=${query.limit}&offset=${query.offset}`,
      ),
      { headers: upstreamHeaders(request, accessToken), cache: 'no-store' },
    );
    if (!upstream.ok) {
      const message = await boundedUpstreamMessage(upstream, 'Could not load the staff roster.');
      return privateNoStore({ message }, upstreamStatus(upstream.status));
    }
    const payload: unknown = await upstream.json();
    return isPharmacyStaffCatalogue(payload)
      ? privateNoStore(payload, 200)
      : privateNoStore({ message: 'Pharmacy staff service returned an invalid response.' }, 502);
  } catch {
    return privateNoStore({ message: 'Pharmacy staff service is unavailable.' }, 503);
  }
}

function parseListQuery(search: URLSearchParams): { limit: number; offset: number } | null {
  if ([...search.keys()].some((key) => key !== 'limit' && key !== 'offset')) return null;
  const limit = parseInteger(search.get('limit'), 50, 1, 100);
  const offset = parseInteger(search.get('offset'), 0, 0, 10_000);
  return limit === null || offset === null ? null : { limit, offset };
}

function parseInteger(
  value: string | null,
  fallback: number,
  minimum: number,
  maximum: number,
): number | null {
  if (value === null) return fallback;
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : null;
}

export async function POST(request: NextRequest, context: Context): Promise<NextResponse> {
  if (!isSameOriginMutation(request)) {
    return privateNoStore({ message: 'Cross-origin request rejected.' }, 403);
  }
  const { providerId } = await context.params;
  if (!isCanonicalUuid(providerId)) {
    return privateNoStore({ message: 'A valid pharmacy is required.' }, 400);
  }
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!accessToken) {
    return privateNoStore({ message: 'Your session has expired. Sign in again.' }, 401);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return privateNoStore({ message: 'A valid staff member is required.' }, 400);
  }
  if (!isAssignPharmacyStaffRequest(body)) {
    return privateNoStore({ message: 'A valid staff member is required.' }, 400);
  }

  try {
    const upstream = await fetch(
      authApiUrl(
        `/authorization/memberships/${encodeURIComponent(body.membershipId)}/provider-access/${encodeURIComponent(providerId)}`,
      ),
      {
        method: 'PUT',
        headers: upstreamHeaders(request, accessToken),
        cache: 'no-store',
      },
    );
    if (!upstream.ok) {
      const message = await boundedUpstreamMessage(upstream, 'Could not assign pharmacy access.');
      return privateNoStore({ message }, upstreamStatus(upstream.status));
    }
    const assignment: unknown = await upstream.json();
    if (
      !isProviderAccessAssignment(assignment) ||
      assignment.membershipId !== body.membershipId ||
      assignment.providerId !== providerId ||
      assignment.providerType !== 'PHARMACY'
    ) {
      return privateNoStore(
        { message: 'Pharmacy staff service returned an invalid response.' },
        502,
      );
    }
    return privateNoStore({ assigned: true }, 200);
  } catch {
    return privateNoStore({ message: 'Pharmacy staff service is unavailable.' }, 503);
  }
}
