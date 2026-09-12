import { NextRequest, NextResponse } from 'next/server';
import {
  authApiUrl,
  boundedUpstreamMessage,
  isSameOriginMutation,
  noStoreJson,
  upstreamHeaders,
} from '@/lib/auth-api';
import { isPatientProfile, isUpdatePatientProfileRequest } from '@/lib/patient-profile-contract';
import { ACCESS_COOKIE } from '@/lib/session-profile';

/**
 * Candidate Task 0032 (pre-0031). Forwards to the backend's own
 * self-service GET/PATCH /patient/profile, which is scoped exclusively
 * by the server-verified access token -- this route never accepts or
 * forwards any client-supplied user identifier.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!accessToken) {
    return noStoreJson({ message: 'Your session has expired. Sign in again.' }, 401);
  }

  try {
    const upstream = await fetch(authApiUrl('/patient/profile'), {
      headers: upstreamHeaders(request, accessToken),
      cache: 'no-store',
    });
    if (!upstream.ok) {
      const message = await boundedUpstreamMessage(upstream, 'Could not load your profile.');
      return noStoreJson({ message }, upstream.status >= 500 ? 502 : upstream.status);
    }
    const payload: unknown = await upstream.json();
    if (!isPatientProfile(payload)) {
      throw new Error('Invalid profile response');
    }
    return noStoreJson(payload, 200);
  } catch {
    return noStoreJson({ message: 'Profile service is unavailable.' }, 503);
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  if (!isSameOriginMutation(request)) {
    return noStoreJson({ message: 'Cross-origin request rejected.' }, 403);
  }
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!accessToken) {
    return noStoreJson({ message: 'Your session has expired. Sign in again.' }, 401);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return noStoreJson({ message: 'A valid profile update is required.' }, 400);
  }
  if (!isUpdatePatientProfileRequest(body)) {
    return noStoreJson({ message: 'A valid profile update is required.' }, 400);
  }

  try {
    const headers = upstreamHeaders(request, accessToken);
    headers.set('content-type', 'application/json');
    const upstream = await fetch(authApiUrl('/patient/profile'), {
      method: 'PATCH',
      headers,
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    if (!upstream.ok) {
      const message = await boundedUpstreamMessage(upstream, 'Could not update your profile.');
      return noStoreJson({ message }, upstream.status >= 500 ? 502 : upstream.status);
    }
    const payload: unknown = await upstream.json();
    if (!isPatientProfile(payload)) {
      throw new Error('Invalid profile response');
    }
    return noStoreJson(payload, 200);
  } catch {
    return noStoreJson({ message: 'Profile service is unavailable.' }, 503);
  }
}
