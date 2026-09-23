import { NextRequest, NextResponse } from 'next/server';
import {
  authApiUrl,
  boundedUpstreamMessage,
  isSameOriginMutation,
  upstreamHeaders,
} from '@/lib/auth-api';
import { isCanonicalUuid } from '@/lib/inventory-contract';
import { isPosReturnReceipt, isPosReturnRequest } from '@/lib/pos-return-contract';
import { ACCESS_COOKIE } from '@/lib/session-profile';

type Context = { params: Promise<{ providerId: string; saleId: string }> };

export async function POST(request: NextRequest, context: Context): Promise<NextResponse> {
  if (!isSameOriginMutation(request)) {
    return privateNoStore({ message: 'Cross-origin request rejected.' }, 403);
  }
  const { providerId, saleId } = await context.params;
  if (!isCanonicalUuid(providerId) || !isCanonicalUuid(saleId)) {
    return privateNoStore({ message: 'A valid provider and sale identifier are required.' }, 400);
  }
  const token = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!token) return privateNoStore({ message: 'Your session has expired. Sign in again.' }, 401);

  let command: unknown;
  try {
    command = await request.json();
  } catch {
    return privateNoStore({ message: 'A valid POS return command is required.' }, 400);
  }
  if (!isPosReturnRequest(command)) {
    return privateNoStore({ message: 'A valid POS return command is required.' }, 400);
  }

  try {
    const headers = upstreamHeaders(request, token);
    headers.set('content-type', 'application/json');
    const upstream = await fetch(
      authApiUrl(
        '/pos/providers/' +
          encodeURIComponent(providerId) +
          '/sales/' +
          encodeURIComponent(saleId) +
          '/returns',
      ),
      { method: 'POST', headers, body: JSON.stringify(command), cache: 'no-store' },
    );
    if (!upstream.ok) {
      return privateNoStore(
        { message: await boundedUpstreamMessage(upstream, 'Unable to record POS return.') },
        mutationStatus(upstream.status),
      );
    }
    const payload: unknown = await upstream.json();
    return isPosReturnReceipt(payload) &&
      payload.providerId === providerId &&
      payload.saleId === saleId
      ? privateNoStore(payload, 200)
      : privateNoStore({ message: 'POS service returned an invalid return receipt.' }, 502);
  } catch {
    return privateNoStore({ message: 'POS service is unavailable.' }, 503);
  }
}

function mutationStatus(status: number): number {
  return [401, 403, 404, 409].includes(status) ? status : status >= 500 ? 502 : 400;
}
function privateNoStore(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, { status, headers: { 'cache-control': 'private, no-store' } });
}
