import { NextRequest, NextResponse } from 'next/server';
import {
  authApiUrl,
  boundedUpstreamMessage,
  isSameOriginMutation,
  upstreamHeaders,
} from '@/lib/auth-api';
import { isCanonicalUuid } from '@/lib/inventory-contract';
import {
  isPharmacyVerificationState,
  isSubmitPharmacyVerificationRequest,
} from '@/lib/pharmacy-verification-contract';
import { ACCESS_COOKIE } from '@/lib/session-profile';

/**
 * Candidate Task 0039 (PROVISIONAL). Forwards to the sealed backend's
 * own GET /providers/:providerId/verification and
 * POST /providers/:providerId/verification. Preserves the dual-state
 * model (`current` / `openSubmission`) exactly -- never flattened to
 * one status -- and enforces the same opaque evidence-reference
 * contract as the sealed backend DTO before ever forwarding a
 * submission.
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
      authApiUrl(`/providers/${encodeURIComponent(providerId)}/verification`),
      { headers: upstreamHeaders(request, accessToken), cache: 'no-store' },
    );
    if (!upstream.ok) {
      const message = await boundedUpstreamMessage(
        upstream,
        'Could not load the verification status.',
      );
      return privateNoStore({ message }, mutationStatus(upstream.status));
    }
    const payload: unknown = await upstream.json();
    if (!isPharmacyVerificationState(payload)) {
      throw new Error('Invalid verification state response');
    }
    return privateNoStore(payload, 200);
  } catch {
    return privateNoStore({ message: 'Verification service is unavailable.' }, 503);
  }
}

export async function POST(request: NextRequest, context: Context): Promise<NextResponse> {
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
    return privateNoStore({ message: 'A valid verification submission is required.' }, 400);
  }
  // Fail closed BEFORE any upstream call: exactly 4 keys are allowed;
  // "tenantId", "providerType", "status", "isVerified", "reviewer",
  // "reviewerId", "verificationNotes", or any other key rejects the
  // whole request. governmentIdReference is validated against the
  // same opaque-identifier syntax the sealed backend enforces.
  if (!isSubmitPharmacyVerificationRequest(body)) {
    return privateNoStore({ message: 'A valid verification submission is required.' }, 400);
  }

  const outbound = {
    licenseNumber: body.licenseNumber,
    licenseExpiryDate: body.licenseExpiryDate,
    businessRegistrationNumber: body.businessRegistrationNumber,
    governmentIdReference: body.governmentIdReference,
  };

  try {
    const headers = upstreamHeaders(request, accessToken);
    headers.set('content-type', 'application/json');
    const upstream = await fetch(
      authApiUrl(`/providers/${encodeURIComponent(providerId)}/verification`),
      { method: 'POST', headers, body: JSON.stringify(outbound), cache: 'no-store' },
    );
    if (!upstream.ok) {
      const message = await boundedUpstreamMessage(upstream, 'Could not submit the verification.');
      return privateNoStore({ message }, mutationStatus(upstream.status));
    }
    let receipt: unknown;
    try {
      receipt = await upstream.json();
    } catch {
      return privateNoStore({ message: 'Verification service returned an invalid response.' }, 502);
    }
    if (
      !receipt ||
      typeof receipt !== 'object' ||
      Array.isArray(receipt) ||
      Object.keys(receipt).length !== 1 ||
      !isCanonicalUuid((receipt as Record<string, unknown>).verificationId)
    ) {
      return privateNoStore({ message: 'Verification service returned an invalid response.' }, 502);
    }
    return privateNoStore(
      { verificationId: (receipt as { verificationId: string }).verificationId },
      200,
    );
  } catch {
    return privateNoStore({ message: 'Verification service is unavailable.' }, 503);
  }
}
