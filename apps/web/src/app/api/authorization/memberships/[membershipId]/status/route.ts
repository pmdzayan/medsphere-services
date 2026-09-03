import { NextRequest, NextResponse } from 'next/server';
import {
  authApiUrl,
  boundedUpstreamMessage,
  isSameOriginMutation,
  noStoreJson,
  publicUpstreamStatus,
  upstreamHeaders,
} from '@/lib/auth-api';
import { ACCESS_COOKIE } from '@/lib/session-profile';

type Context = { params: Promise<{ membershipId: string }> };

export async function PATCH(request: NextRequest, context: Context): Promise<NextResponse> {
  if (!isSameOriginMutation(request)) {
    return noStoreJson({ message: 'Cross-origin request rejected.' }, 403);
  }

  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!accessToken) {
    return noStoreJson({ message: 'Authentication required.' }, 401);
  }

  const { membershipId } = await context.params;
  if (!membershipId) {
    return noStoreJson({ message: 'Membership ID is required.' }, 400);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return noStoreJson({ message: 'Invalid JSON request body.' }, 400);
  }

  if (
    !body ||
    typeof body !== 'object' ||
    !('status' in body) ||
    !['SUSPENDED', 'REVOKED'].includes((body as { status: unknown }).status as string)
  ) {
    return noStoreJson({ message: 'Target status must be SUSPENDED or REVOKED.' }, 400);
  }

  const targetStatus = (body as { status: 'SUSPENDED' | 'REVOKED' }).status;

  let upstream: Response;
  try {
    const headers = upstreamHeaders(request, accessToken);
    headers.set('content-type', 'application/json');
    upstream = await fetch(authApiUrl(`/authorization/memberships/${membershipId}/status`), {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ status: targetStatus }),
      cache: 'no-store',
    });
  } catch {
    return noStoreJson({ message: 'Authorization service is unavailable.' }, 503);
  }

  if (!upstream.ok) {
    const message = await boundedUpstreamMessage(
      upstream,
      'Unable to update membership access status.',
    );
    const status = upstream.status === 404 ? 404 : publicUpstreamStatus(upstream.status);
    return noStoreJson({ message }, status);
  }

  try {
    const data: unknown = await upstream.json();
    return noStoreJson(data, 200);
  } catch {
    return noStoreJson({ message: 'Authorization service returned invalid response.' }, 502);
  }
}
