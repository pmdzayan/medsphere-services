import { NextRequest, NextResponse } from 'next/server';
import { authApiUrl, boundedUpstreamMessage, noStoreJson, upstreamHeaders } from '@/lib/auth-api';
import { isCanonicalUuid } from '@/lib/inventory-contract';
import { isPatientLiveAvailabilityRequestResponse } from '@/lib/patient-medicine-search-contract';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ requestId: string }> };

/**
 * GET /api/public/medicine-discovery/availability-requests/:requestId
 *
 * Minimized public status read for a request the patient already created.
 * The opaque request id is the only reference; tenant/patient identity stays
 * hidden and expired/unknown requests are indistinguishable from not-found.
 */
export async function GET(request: NextRequest, context: Context): Promise<NextResponse> {
  const { requestId } = await context.params;
  if (!isCanonicalUuid(requestId)) {
    return noStoreJson({ message: 'A valid live-check request is required.' }, 400);
  }

  let upstream: Response;
  try {
    upstream = await fetch(
      authApiUrl(
        `/public/medicine-discovery/availability-requests/${encodeURIComponent(requestId)}`,
      ),
      { headers: upstreamHeaders(request), cache: 'no-store' },
    );
  } catch {
    return noStoreJson({ message: 'Live check is unavailable right now.' }, 503);
  }
  if (!upstream.ok) {
    const message = await boundedUpstreamMessage(upstream, 'Live check is unavailable right now.');
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

function liveUpstreamStatus(status: number): number {
  return [401, 403, 404, 429].includes(status) ? status : status >= 500 ? 502 : 400;
}
