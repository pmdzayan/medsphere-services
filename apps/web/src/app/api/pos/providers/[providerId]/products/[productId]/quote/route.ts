import { NextRequest, NextResponse } from 'next/server';
import { authApiUrl, boundedUpstreamMessage, upstreamHeaders } from '@/lib/auth-api';
import { isCanonicalUuid } from '@/lib/inventory-contract';
import { isPosProductQuote } from '@/lib/pos-contract';
import { ACCESS_COOKIE } from '@/lib/session-profile';

type Context = { params: Promise<{ providerId: string; productId: string }> };

export async function GET(request: NextRequest, context: Context): Promise<NextResponse> {
  const { providerId, productId } = await context.params;
  if (!isCanonicalUuid(providerId) || !isCanonicalUuid(productId)) return privateNoStore({ message: 'A valid provider and product identifier are required.' }, 400);
  const token = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!token) return privateNoStore({ message: 'Your session has expired. Sign in again.' }, 401);
  try {
    const upstream = await fetch(authApiUrl('/pos/providers/' + encodeURIComponent(providerId) + '/products/' + encodeURIComponent(productId) + '/quote'), { headers: upstreamHeaders(request, token), cache: 'no-store' });
    if (!upstream.ok) return privateNoStore({ message: await boundedUpstreamMessage(upstream, 'Unable to load POS quote.') }, status(upstream.status));
    const payload: unknown = await upstream.json();
    return isPosProductQuote(payload) && payload.providerId === providerId && payload.productId === productId
      ? privateNoStore(payload, 200)
      : privateNoStore({ message: 'POS service returned an invalid product quote.' }, 502);
  } catch { return privateNoStore({ message: 'POS service is unavailable.' }, 503); }
}
function status(value: number): number { return [401,403,404,409].includes(value) ? value : value >= 500 ? 502 : 400; }
function privateNoStore(body: unknown, code: number): NextResponse { return NextResponse.json(body, { status: code, headers: { 'cache-control': 'private, no-store' } }); }
