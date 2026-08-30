import { NextRequest, NextResponse } from 'next/server';
import {
  authApiUrl,
  isSameOriginMutation,
  publicUpstreamStatus,
  upstreamHeaders,
} from '@/lib/auth-api';
import {
  isLanguageUpdateRequest,
  isLanguageUpdateResponse,
  type SupportedLanguageCode,
} from '@/lib/settings-contract';
import { clearSessionProfileCookie, setSessionProfileCookie } from '@/lib/session-cookies';
import {
  ACCESS_COOKIE,
  PROFILE_COOKIE,
  REFRESH_COOKIE,
  readSessionProfile,
} from '@/lib/session-profile';

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  if (!isSameOriginMutation(request)) {
    return failure('CROSS_ORIGIN_MUTATION_REJECTED', 'Cross-origin request rejected.', 403);
  }
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!accessToken) {
    return failure('SESSION_EXPIRED', 'Your session has expired. Sign in again.', 401);
  }

  let preferredLanguage: SupportedLanguageCode;
  try {
    const body: unknown = await request.json();
    if (!isLanguageUpdateRequest(body)) throw new Error('Invalid language update');
    preferredLanguage = body.preferredLanguage;
  } catch {
    return failure('LANGUAGE_UPDATE_INVALID', 'Invalid language update.', 400);
  }

  let upstream: Response;
  try {
    const headers = upstreamHeaders(request, accessToken);
    headers.set('content-type', 'application/json');
    upstream = await fetch(authApiUrl('/users/me/language'), {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ preferredLanguage }),
      cache: 'no-store',
    });
  } catch {
    return failure('LANGUAGE_SERVICE_UNAVAILABLE', 'Language service is unavailable.', 503);
  }

  if (!upstream.ok) {
    // Do not reflect upstream exception text through this public BFF.
    return failure(
      upstream.status === 401 ? 'SESSION_EXPIRED' : 'LANGUAGE_UPDATE_FAILED',
      upstream.status === 401
        ? 'Your session has expired. Sign in again.'
        : 'Unable to update language.',
      publicUpstreamStatus(upstream.status),
    );
  }

  try {
    const payload: unknown = await upstream.json();
    if (!isLanguageUpdateResponse(payload)) throw new Error('Invalid language update response');
    const response = noStore(payload, 200);
    synchronizeSessionProfileLanguage(request, response, preferredLanguage);
    return response;
  } catch {
    return failure(
      'LANGUAGE_SERVICE_RESPONSE_INVALID',
      'Language service returned an invalid response.',
      502,
    );
  }
}

function noStore(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, { status, headers: { 'cache-control': 'no-store' } });
}

function synchronizeSessionProfileLanguage(
  request: NextRequest,
  response: NextResponse,
  preferredLanguage: SupportedLanguageCode,
): void {
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;
  const sealedProfile = request.cookies.get(PROFILE_COOKIE)?.value;
  const profile = readSessionProfile(sealedProfile, refreshToken);

  if (!refreshToken || !profile) {
    // The backend preference is already durable. Never mint a profile from
    // untrusted cookie contents; remove only the stale cache so it cannot
    // override local/browser preference on the next server render.
    clearSessionProfileCookie(response);
    return;
  }

  setSessionProfileCookie(
    response,
    {
      ...profile,
      user: { ...profile.user, preferredLanguage },
    },
    refreshToken,
  );
}

function failure(code: string, message: string, status: number): NextResponse {
  return noStore({ code, message }, status);
}
