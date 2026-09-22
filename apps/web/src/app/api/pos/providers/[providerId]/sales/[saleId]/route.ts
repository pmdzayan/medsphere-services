import { NextRequest, NextResponse } from 'next/server';
import { authApiUrl, boundedUpstreamMessage, upstreamHeaders } from '@/lib/auth-api';
import { isCanonicalUuid } from '@/lib/inventory-contract';
import { isPosSaleReceipt } from '@/lib/pos-contract';
import { ACCESS_COOKIE } from '@/lib/session-profile';

type Context = { params: Promise<{ providerId: string; saleId: string }> };

export async function GET(request: NextRequest, context: Context): Promise<NextResponse> {
  const { providerId, saleId } = await context.params;
  if (!isCanonicalUuid(providerId) || !isCanonicalUuid(saleId)) return privateNoStore({ message: 'A valid provider and sale identifier are required.' }, 400);
  const token = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!token) return privateNoStore({ message: 'Your session has expired. Sign in again.' }, 401);
  try {
    const upstream = await fetch(authApiUrl('/pos/providers/' + encodeURIComponent(providerId) + '/sales/' + encodeURIComponent(saleId)), { headers: upstreamHeaders(request, token), cache: 'no-store' });
    if (!upstream.ok) return privateNoStore({ message: await boundedUpstreamMessage(upstream, 'Unable to load POS sale.') }, status(upstream.status));
    const payload: unknown = await upstream.json();
    return isPosSaleReceipt(payload) && payload.providerId === providerId && payload.saleId === saleId
      ? privateNoStore(payload, 200)
      : privateNoStore({ message: 'POS service returned an invalid sale receipt.' }, 502);
  } catch { return privateNoStore({ message: 'POS service is unavailable.' }, 503); }
}
function status(value: number): number { return [401,403,404,409].includes(value) ? value : value >= 500 ? 502 : 400; }
function privateNoStore(body: unknown, code: number): NextResponse { return NextResponse.json(body, { status: code, headers: { 'cache-control': 'private, no-store' } }); }
