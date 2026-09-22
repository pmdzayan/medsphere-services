import { NextRequest, NextResponse } from 'next/server';
import { authApiUrl, boundedUpstreamMessage, isSameOriginMutation, upstreamHeaders } from '@/lib/auth-api';
import { isCanonicalUuid } from '@/lib/inventory-contract';
import { isPosInventoryFiscalProfileRequest } from '@/lib/pos-contract';
import { ACCESS_COOKIE } from '@/lib/session-profile';

type Context = { params: Promise<{ providerId: string; inventoryId: string }> };

export async function PUT(request: NextRequest, context: Context): Promise<NextResponse> {
  if (!isSameOriginMutation(request)) return privateNoStore({ message: 'Cross-origin request rejected.' }, 403);
  const { providerId, inventoryId } = await context.params;
  if (!isCanonicalUuid(providerId) || !isCanonicalUuid(inventoryId)) return privateNoStore({ message: 'A valid provider and inventory identifier are required.' }, 400);
  const token = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!token) return privateNoStore({ message: 'Your session has expired. Sign in again.' }, 401);
  let command: unknown;
  try { command = await request.json(); } catch { return privateNoStore({ message: 'A valid inventory fiscal profile is required.' }, 400); }
  if (!isPosInventoryFiscalProfileRequest(command)) return privateNoStore({ message: 'A valid inventory fiscal profile is required.' }, 400);
  try {
    const headers = upstreamHeaders(request, token); headers.set('content-type', 'application/json');
    const upstream = await fetch(authApiUrl('/pos/providers/' + encodeURIComponent(providerId) + '/inventories/' + encodeURIComponent(inventoryId) + '/fiscal-profile'), { method: 'PUT', headers, body: JSON.stringify(command), cache: 'no-store' });
    if (!upstream.ok) return privateNoStore({ message: await boundedUpstreamMessage(upstream, 'Unable to update inventory fiscal profile.') }, status(upstream.status));
    const payload: unknown = await upstream.json();
    if (!payload || typeof payload !== 'object') return privateNoStore({ message: 'POS service returned an invalid response.' }, 502);
    return privateNoStore(payload, 200);
  } catch { return privateNoStore({ message: 'POS service is unavailable.' }, 503); }
}
function status(value: number): number { return [401,403,404,409].includes(value) ? value : value >= 500 ? 502 : 400; }
function privateNoStore(body: unknown, code: number): NextResponse { return NextResponse.json(body, { status: code, headers: { 'cache-control': 'private, no-store' } }); }
