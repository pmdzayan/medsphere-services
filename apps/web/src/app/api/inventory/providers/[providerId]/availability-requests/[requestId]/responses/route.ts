import { NextRequest, NextResponse } from 'next/server';
import {
  authApiUrl,
  boundedUpstreamMessage,
  isSameOriginMutation,
  upstreamHeaders,
} from '@/lib/auth-api';
import {
  isAvailabilityResponseReceipt,
  isAvailabilityResponseRequest,
} from '@/lib/availability-request-contract';
import { isCanonicalUuid } from '@/lib/inventory-contract';
import { ACCESS_COOKIE } from '@/lib/session-profile';

type Context = { params: Promise<{ providerId: string; requestId: string }> };

export async function POST(request: NextRequest, context: Context): Promise<NextResponse> {
  if (!isSameOriginMutation(request))
    return privateNoStore({ message: 'Cross-origin request rejected.' }, 403);
  const { providerId, requestId } = await context.params;
  if (!isCanonicalUuid(providerId) || !isCanonicalUuid(requestId)) {
    return privateNoStore({ message: 'Valid provider and request identifiers are required.' }, 400);
  }
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!accessToken)
    return privateNoStore({ message: 'Your session has expired. Sign in again.' }, 401);

  let command: unknown;
  try {
    command = await request.json();
  } catch {
    return privateNoStore({ message: 'A valid availability response is required.' }, 400);
  }
  if (!isAvailabilityResponseRequest(command)) {
    return privateNoStore({ message: 'A valid availability response is required.' }, 400);
  }

  try {
    const headers = upstreamHeaders(request, accessToken);
    headers.set('content-type', 'application/json');
    const upstream = await fetch(
      authApiUrl(
        `/inventory/providers/${encodeURIComponent(providerId)}/availability-requests/${encodeURIComponent(requestId)}/responses`,
      ),
      { method: 'POST', headers, body: JSON.stringify(command), cache: 'no-store' },
    );
    if (!upstream.ok) {
      return privateNoStore(
        {
          message: await boundedUpstreamMessage(
            upstream,
            'Unable to respond to availability request.',
          ),
        },
        [401, 403, 404, 409, 412, 428].includes(upstream.status)
          ? upstream.status
          : upstream.status >= 500
            ? 502
            : 400,
      );
    }
    const payload: unknown = await upstream.json();
    return isAvailabilityResponseReceipt(payload)
      ? privateNoStore(payload, 200)
      : privateNoStore({ message: 'Availability service returned an invalid response.' }, 502);
  } catch {
    return privateNoStore({ message: 'Availability service is unavailable.' }, 503);
  }
}
function privateNoStore(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, { status, headers: { 'cache-control': 'private, no-store' } });
}
