import { NextRequest, NextResponse } from 'next/server';
import {
  authApiUrl,
  boundedUpstreamMessage,
  isSameOriginMutation,
  upstreamHeaders,
} from '@/lib/auth-api';
import { isCanonicalUuid } from '@/lib/inventory-contract';
import { isBatchRecallResponse, isRecallBatchRequest } from '@/lib/inventory-exception-contract';
import { ACCESS_COOKIE } from '@/lib/session-profile';

type Context = { params: Promise<{ providerId: string; batchId: string }> };

export async function POST(request: NextRequest, context: Context): Promise<NextResponse> {
  if (!isSameOriginMutation(request)) return privateNoStore({ message: 'Cross-origin request rejected.' }, 403);
  const { providerId, batchId } = await context.params;
  if (!isCanonicalUuid(providerId) || !isCanonicalUuid(batchId)) {
    return privateNoStore({ message: 'Valid provider and batch identifiers are required.' }, 400);
  }
  const token = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!token) return privateNoStore({ message: 'Your session has expired. Sign in again.' }, 401);

  let command: unknown;
  try {
    command = await request.json();
  } catch {
    return privateNoStore({ message: 'A valid recall command is required.' }, 400);
  }
  if (!isRecallBatchRequest(command)) return privateNoStore({ message: 'A valid recall command is required.' }, 400);

  try {
    const headers = upstreamHeaders(request, token);
    headers.set('content-type', 'application/json');
    const upstream = await fetch(
      authApiUrl(
        `/inventory/providers/${encodeURIComponent(providerId)}/batches/${encodeURIComponent(batchId)}/recall`,
      ),
      { method: 'POST', headers, body: JSON.stringify(command), cache: 'no-store' },
    );
    if (!upstream.ok) {
      return privateNoStore(
        { message: await boundedUpstreamMessage(upstream, 'Unable to recall this batch.') },
        mutationStatus(upstream.status),
      );
    }
    const payload: unknown = await upstream.json();
    return isBatchRecallResponse(payload) && payload.batchId === batchId
      ? privateNoStore(payload, 200)
      : privateNoStore({ message: 'Inventory service returned an invalid recall receipt.' }, 502);
  } catch {
    return privateNoStore({ message: 'Inventory service is unavailable.' }, 503);
  }
}
function mutationStatus(status: number): number {
  return [401, 403, 404, 409, 412, 428].includes(status) ? status : status >= 500 ? 502 : 400;
}
function privateNoStore(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, { status, headers: { 'cache-control': 'private, no-store' } });
}
