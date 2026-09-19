import { NextRequest, NextResponse } from 'next/server';
import {
  authApiUrl,
  boundedUpstreamMessage,
  isSameOriginMutation,
  upstreamHeaders,
} from '@/lib/auth-api';
import { isCanonicalUuid } from '@/lib/inventory-contract';
import {
  isPharmacyProfile,
  isUpdatePharmacyProfileRequest,
} from '@/lib/pharmacy-verification-contract';
import { ACCESS_COOKIE } from '@/lib/session-profile';

/**
 * Candidate Task 0039 (PROVISIONAL). Forwards to the sealed backend's
 * own GET/PATCH /providers/:providerId/profile. The backend remains
 * fully authoritative for the identity -> membership -> provider
 * assignment -> permission chain; this route never manufactures
 * authorization -- it only forwards the authenticated session's
 * access token and a route-supplied provider id, exactly like the
 * accepted Task 0028 provider-scoped BFF routes.
 */

type Context = { params: Promise<{ providerId: string }> };

function privateNoStore(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, { status, headers: { 'cache-control': 'private, no-store' } });
}

function mutationStatus(status: number): number {
  if ([401, 403, 404, 409, 412, 428].includes(status)) return status;
  return status >= 500 ? 502 : 400;
}

export async function GET(request: NextRequest, context: Context): Promise<NextResponse> {
  const { providerId } = await context.params;
  if (!isCanonicalUuid(providerId)) {
    return privateNoStore({ message: 'A valid pharmacy is required.' }, 400);
  }
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!accessToken) {
    return privateNoStore({ message: 'Your session has expired. Sign in again.' }, 401);
  }

  try {
    const upstream = await fetch(
      authApiUrl(`/providers/${encodeURIComponent(providerId)}/profile`),
      { headers: upstreamHeaders(request, accessToken), cache: 'no-store' },
    );
    if (!upstream.ok) {
      const message = await boundedUpstreamMessage(
        upstream,
        'Could not load the pharmacy profile.',
      );
      return privateNoStore({ message }, mutationStatus(upstream.status));
    }
    const payload: unknown = await upstream.json();
    if (!isPharmacyProfile(payload)) {
      throw new Error('Invalid profile response');
    }
    return privateNoStore(payload, 200);
  } catch {
    return privateNoStore({ message: 'Pharmacy profile service is unavailable.' }, 503);
  }
}

export async function PATCH(request: NextRequest, context: Context): Promise<NextResponse> {
  if (!isSameOriginMutation(request)) {
    return privateNoStore({ message: 'Cross-origin request rejected.' }, 403);
  }
  const { providerId } = await context.params;
  if (!isCanonicalUuid(providerId)) {
    return privateNoStore({ message: 'A valid pharmacy is required.' }, 400);
  }
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!accessToken) {
    return privateNoStore({ message: 'Your session has expired. Sign in again.' }, 401);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return privateNoStore({ message: 'A valid profile update is required.' }, 400);
  }
  // Fail closed BEFORE any upstream call: unknown/forbidden keys
  // (tenantId, providerType, isVerified, isActive, deletedAt, status,
  // verificationStatus, role, roles, permissions, ...) reject the
  // ENTIRE request here -- never silently stripped, never forwarded.
  if (!isUpdatePharmacyProfileRequest(body)) {
    return privateNoStore({ message: 'A valid profile update is required.' }, 400);
  }

  // Explicit allowlist construction -- never `{ ...body }`. Only
  // fields the client actually sent (partial update) are included,
  // and only from this fixed, reviewed list.
  const outbound: Record<string, string | number> = {};
  if (body.businessName !== undefined) outbound.businessName = body.businessName;
  if (body.ownerName !== undefined) outbound.ownerName = body.ownerName;
  if (body.email !== undefined) outbound.email = body.email;
  if (body.phone !== undefined) outbound.phone = body.phone;
  if (body.address !== undefined) outbound.address = body.address;
  if (body.city !== undefined) outbound.city = body.city;
  if (body.state !== undefined) outbound.state = body.state;
  if (body.country !== undefined) outbound.country = body.country;
  if (body.postalCode !== undefined) outbound.postalCode = body.postalCode;
  if (body.latitude !== undefined) outbound.latitude = body.latitude;
  if (body.longitude !== undefined) outbound.longitude = body.longitude;

  try {
    const headers = upstreamHeaders(request, accessToken);
    headers.set('content-type', 'application/json');
    const upstream = await fetch(
      authApiUrl(`/providers/${encodeURIComponent(providerId)}/profile`),
      { method: 'PATCH', headers, body: JSON.stringify(outbound), cache: 'no-store' },
    );
    if (!upstream.ok) {
      const message = await boundedUpstreamMessage(
        upstream,
        'Could not update the pharmacy profile.',
      );
      return privateNoStore({ message }, mutationStatus(upstream.status));
    }
    let receipt: unknown;
    try {
      receipt = await upstream.json();
    } catch {
      return privateNoStore(
        { message: 'Pharmacy profile service returned an invalid response.' },
        502,
      );
    }
    return privateNoStore(receipt, 200);
  } catch {
    return privateNoStore({ message: 'Pharmacy profile service is unavailable.' }, 503);
  }
}
