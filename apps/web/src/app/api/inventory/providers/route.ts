import { NextRequest, NextResponse } from 'next/server';
import { authApiUrl, boundedUpstreamMessage, upstreamHeaders } from '@/lib/auth-api';
import { isProviderAccessList } from '@/lib/inventory-contract';
import {
  ACCESS_COOKIE,
  PROFILE_COOKIE,
  REFRESH_COOKIE,
  readSessionProfile,
} from '@/lib/session-profile';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  if ([...request.nextUrl.searchParams.keys()].length > 0) {
    return privateNoStore({ message: 'Unsupported provider query.' }, 400);
  }
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;
  const profile = readSessionProfile(request.cookies.get(PROFILE_COOKIE)?.value, refreshToken);
  if (!accessToken || !profile) {
    return privateNoStore({ message: 'Your session has expired. Sign in again.' }, 401);
  }

  let upstream: Response;
  try {
    upstream = await fetch(
      authApiUrl(
        `/authorization/memberships/${encodeURIComponent(profile.context.membershipId)}/provider-access`,
      ),
      { headers: upstreamHeaders(request, accessToken), cache: 'no-store' },
    );
  } catch {
    return privateNoStore({ message: 'Authorization service is unavailable.' }, 503);
  }
  if (!upstream.ok) {
    const message = await boundedUpstreamMessage(upstream, 'Unable to load assigned providers.');
    return privateNoStore({ message }, inventoryUpstreamStatus(upstream.status));
  }
  try {
    const payload: unknown = await upstream.json();
    return isProviderAccessList(payload)
      ? privateNoStore(
          payload.filter((provider) => provider.isActive),
          200,
        )
      : privateNoStore({ message: 'Authorization service returned an invalid response.' }, 502);
  } catch {
    return privateNoStore({ message: 'Authorization service returned an invalid response.' }, 502);
  }
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
