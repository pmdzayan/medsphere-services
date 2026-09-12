import { NextRequest, NextResponse } from 'next/server';
import { authApiUrl, boundedUpstreamMessage, noStoreJson, upstreamHeaders } from '@/lib/auth-api';
import { isCanonicalUuid } from '@/lib/inventory-contract';
import { isPatientLiveAvailabilityRequestResponse } from '@/lib/patient-medicine-search-contract';

export const dynamic = 'force-dynamic';

type Context = {
  params: Promise<{ providerId: string; productId: string }>;
};

/**
 * POST /api/public/medicine-discovery/providers/:providerId/products/:productId/availability-requests
 *
 * Forwards to the accepted Task 0026 public live-availability surface. The
 * request body MUST be empty (any key fails validation), the patient supplies
 * only opaque provider/product path references, and every Task 0027 control
 * (opt-in, quiet hours, timezone, ceilings, dedupe, expiry) is enforced by the
 * accepted backend service. No patient identity, coordinates or search terms
 * are ever sent or stored.
 */
export async function POST(request: NextRequest, context: Context): Promise<NextResponse> {
  if (!request.body) {
    return noStoreJson({ message: 'A valid request is required.' }, 400);
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return noStoreJson({ message: 'This request accepts no payload.' }, 400);
  }
  // The backend accepts an empty object only; reject any supplied keys.
  if (!isStrictEmptyBody(body)) {
    return noStoreJson({ message: 'This request accepts no payload.' }, 400);
  }

  const { providerId, productId } = await context.params;
  if (!isCanonicalUuid(providerId) || !isCanonicalUuid(productId)) {
    return noStoreJson({ message: 'A valid medicine is required.' }, 400);
  }

  let upstream: Response;
  try {
    upstream = await fetch(
      authApiUrl(
        `/public/medicine-discovery/providers/${encodeURIComponent(providerId)}/products/${encodeURIComponent(productId)}/availability-requests`,
      ),
      { method: 'POST', headers: upstreamHeaders(request), cache: 'no-store' },
    );
  } catch {
    return noStoreJson({ message: 'This pharmacy cannot take live checks right now.' }, 503);
  }
  if (!upstream.ok) {
    const message = await boundedUpstreamMessage(upstream, 'Unable to request a live check.');
    return noStoreJson({ message }, liveUpstreamStatus(upstream.status));
  }
  try {
    const payload: unknown = await upstream.json();
    return isPatientLiveAvailabilityRequestResponse(payload)
      ? noStoreJson(payload, 200)
      : noStoreJson({ message: 'Live check returned an invalid response.' }, 502);
  } catch {
    return noStoreJson({ message: 'Live check returned an invalid response.' }, 502);
  }
}

function isStrictEmptyBody(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  return Object.keys(value).length === 0;
}

function liveUpstreamStatus(status: number): number {
  return [401, 403, 404, 429].includes(status) ? status : status >= 500 ? 502 : 400;
}
