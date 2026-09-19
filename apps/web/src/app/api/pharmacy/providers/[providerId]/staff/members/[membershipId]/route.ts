import { NextRequest, NextResponse } from 'next/server';
import {
  authApiUrl,
  boundedUpstreamMessage,
  isSameOriginMutation,
  upstreamHeaders,
} from '@/lib/auth-api';
import { isCanonicalUuid } from '@/lib/inventory-contract';
import { ACCESS_COOKIE } from '@/lib/session-profile';

type Context = { params: Promise<{ providerId: string; membershipId: string }> };

function privateNoStore(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, { status, headers: { 'cache-control': 'private, no-store' } });
}

function upstreamStatus(status: number): number {
  if ([401, 403, 404, 409].includes(status)) return status;
  return status >= 500 ? 502 : 400;
}

export async function DELETE(request: NextRequest, context: Context): Promise<NextResponse> {
  if (!isSameOriginMutation(request)) {
    return privateNoStore({ message: 'Cross-origin request rejected.' }, 403);
  }
  const { providerId, membershipId } = await context.params;
  if (!isCanonicalUuid(providerId) || !isCanonicalUuid(membershipId)) {
    return privateNoStore({ message: 'A valid pharmacy and staff member are required.' }, 400);
  }
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!accessToken) {
    return privateNoStore({ message: 'Your session has expired. Sign in again.' }, 401);
  }

  try {
    const upstream = await fetch(
      authApiUrl(
        `/authorization/memberships/${encodeURIComponent(membershipId)}/provider-access/${encodeURIComponent(providerId)}`,
      ),
      { method: 'DELETE', headers: upstreamHeaders(request, accessToken), cache: 'no-store' },
    );
    if (!upstream.ok && upstream.status !== 204) {
      const message = await boundedUpstreamMessage(upstream, 'Could not revoke pharmacy access.');
      return privateNoStore({ message }, upstreamStatus(upstream.status));
    }
    return privateNoStore({ revoked: true }, 200);
  } catch {
    return privateNoStore({ message: 'Pharmacy staff service is unavailable.' }, 503);
  }
}
