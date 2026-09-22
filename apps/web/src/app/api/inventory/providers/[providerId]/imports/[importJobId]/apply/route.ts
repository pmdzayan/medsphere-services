import { NextRequest, NextResponse } from 'next/server';
import {
  authApiUrl,
  boundedUpstreamMessage,
  isSameOriginMutation,
  upstreamHeaders,
} from '@/lib/auth-api';
import {
  isApplyInventoryImportRequest,
  isInventoryImportApplyReceipt,
} from '@/lib/inventory-import-contract';
import { isCanonicalUuid } from '@/lib/inventory-contract';
import { ACCESS_COOKIE } from '@/lib/session-profile';

type Context = { params: Promise<{ providerId: string; importJobId: string }> };

export async function POST(request: NextRequest, context: Context): Promise<NextResponse> {
  if (!isSameOriginMutation(request)) {
    return privateNoStore({ message: 'Cross-origin request rejected.' }, 403);
  }
  const { providerId, importJobId } = await context.params;
  if (!isCanonicalUuid(providerId) || !isCanonicalUuid(importJobId)) {
    return privateNoStore({ message: 'A valid inventory import is required.' }, 400);
  }
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!accessToken) {
    return privateNoStore({ message: 'Your session has expired. Sign in again.' }, 401);
  }

  let command: unknown;
  try {
    command = await request.json();
  } catch {
    return privateNoStore({ message: 'A valid inventory import command is required.' }, 400);
  }
  if (!isApplyInventoryImportRequest(command)) {
    return privateNoStore({ message: 'A valid inventory import command is required.' }, 400);
  }

  try {
    const headers = upstreamHeaders(request, accessToken);
    headers.set('content-type', 'application/json');
    const upstream = await fetch(
      authApiUrl(
        `/inventory/providers/${encodeURIComponent(providerId)}/imports/${encodeURIComponent(importJobId)}/apply`,
      ),
      { method: 'POST', headers, body: JSON.stringify(command), cache: 'no-store' },
    );
    if (!upstream.ok) {
      const message = await boundedUpstreamMessage(upstream, 'Unable to apply inventory import.');
      return privateNoStore({ message }, mutationStatus(upstream.status));
    }
    const payload: unknown = await upstream.json();
    return isInventoryImportApplyReceipt(payload)
      ? privateNoStore(payload, 200)
      : privateNoStore({ message: 'Inventory service returned an invalid response.' }, 502);
  } catch {
    return privateNoStore({ message: 'Inventory service is unavailable.' }, 503);
  }
}

function mutationStatus(status: number): number {
  return [401, 403, 404, 409].includes(status) ? status : status >= 500 ? 502 : 400;
}

function privateNoStore(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, { status, headers: { 'cache-control': 'private, no-store' } });
}
