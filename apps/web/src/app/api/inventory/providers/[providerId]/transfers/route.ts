import { NextRequest, NextResponse } from 'next/server';
import {
  authApiUrl,
  boundedUpstreamMessage,
  isSameOriginMutation,
  upstreamHeaders,
} from '@/lib/auth-api';
import {
  isCanonicalUuid,
  isCompletedTransferRequest,
  isCompletedTransferResponse,
} from '@/lib/inventory-contract';
import { ACCESS_COOKIE } from '@/lib/session-profile';

type Context = { params: Promise<{ providerId: string }> };

export async function POST(request: NextRequest, context: Context): Promise<NextResponse> {
  if (!isSameOriginMutation(request)) {
    return privateNoStore({ message: 'Cross-origin request rejected.' }, 403);
  }
  const { providerId } = await context.params;
  if (!isCanonicalUuid(providerId)) {
    return privateNoStore({ message: 'A valid source provider is required.' }, 400);
  }
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!accessToken) {
    return privateNoStore({ message: 'Your session has expired. Sign in again.' }, 401);
  }
  let command: unknown;
  try {
    command = await request.json();
  } catch {
    return privateNoStore({ message: 'A valid completed-transfer command is required.' }, 400);
  }
  if (!isCompletedTransferRequest(command) || command.destinationProviderId === providerId) {
    return privateNoStore({ message: 'A valid completed-transfer command is required.' }, 400);
  }
  try {
    const headers = upstreamHeaders(request, accessToken);
    headers.set('content-type', 'application/json');
    const upstream = await fetch(
      authApiUrl(`/inventory/providers/${encodeURIComponent(providerId)}/transfers`),
      { method: 'POST', headers, body: JSON.stringify(command), cache: 'no-store' },
    );
    if (!upstream.ok) {
      const message = await boundedUpstreamMessage(
        upstream,
        'Unable to record completed transfer.',
      );
      return privateNoStore({ message }, mutationStatus(upstream.status));
    }
    let receipt: unknown;
    try {
      receipt = await upstream.json();
    } catch {
      return privateNoStore({ message: 'Inventory service returned an invalid response.' }, 502);
    }
    return isCompletedTransferResponse(receipt) &&
      receipt.sourceProviderId === providerId &&
      receipt.destinationProviderId === command.destinationProviderId &&
      receipt.sourceBatchId === command.sourceBatchId &&
      receipt.quantity === command.quantity
      ? privateNoStore(receipt, 200)
      : privateNoStore({ message: 'Inventory service returned an invalid response.' }, 502);
  } catch {
    return privateNoStore({ message: 'Inventory service is unavailable.' }, 503);
  }
}

function mutationStatus(status: number): number {
  if ([401, 403, 404, 409, 412, 428].includes(status)) return status;
  return status >= 500 ? 502 : 400;
}

function privateNoStore(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, { status, headers: { 'cache-control': 'private, no-store' } });
}
