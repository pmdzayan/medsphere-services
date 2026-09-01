import { NextRequest, NextResponse } from 'next/server';
import {
  authApiUrl,
  boundedUpstreamMessage,
  isSameOriginMutation,
  noStoreJson,
  publicUpstreamStatus,
  upstreamHeaders,
} from '@/lib/auth-api';
import {
  CONSENT_CATEGORIES,
  CONSENT_SOURCES,
  isConsentStatus,
  isConsentStatusList,
  type RecordConsentRequest,
} from '@/lib/settings-contract';
import { ACCESS_COOKIE } from '@/lib/session-profile';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!accessToken) return unauthenticated();

  let upstream: Response;
  try {
    upstream = await fetch(authApiUrl('/users/me/consent'), {
      headers: upstreamHeaders(request, accessToken),
      cache: 'no-store',
    });
  } catch {
    return noStoreJson({ message: 'Consent service is unavailable.' }, 503);
  }

  if (!upstream.ok) return upstreamFailure(upstream, 'Unable to load consent status.');
  try {
    const payload: unknown = await upstream.json();
    const data = (payload as { data?: unknown })?.data;
    if (!isConsentStatusList(data)) throw new Error('Invalid consent response');
    return noStoreJson({ data }, 200);
  } catch {
    return noStoreJson({ message: 'Consent service returned an invalid response.' }, 502);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isSameOriginMutation(request)) {
    return noStoreJson({ message: 'Cross-origin request rejected.' }, 403);
  }
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!accessToken) return unauthenticated();

  let body: RecordConsentRequest;
  try {
    const payload: unknown = await request.json();
    if (!isRecordConsentRequest(payload)) throw new Error('Invalid consent request');
    body = payload;
  } catch {
    return noStoreJson({ message: 'Invalid consent request.' }, 400);
  }

  let upstream: Response;
  try {
    const headers = upstreamHeaders(request, accessToken);
    headers.set('content-type', 'application/json');
    upstream = await fetch(authApiUrl('/users/me/consent'), {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      cache: 'no-store',
    });
  } catch {
    return noStoreJson({ message: 'Consent service is unavailable.' }, 503);
  }

  if (!upstream.ok) return upstreamFailure(upstream, 'Unable to record consent.');
  try {
    const payload: unknown = await upstream.json();
    if (!isConsentStatus(payload)) throw new Error('Invalid consent response');
    return noStoreJson(payload, 200);
  } catch {
    return noStoreJson({ message: 'Consent service returned an invalid response.' }, 502);
  }
}

function isRecordConsentRequest(value: unknown): value is RecordConsentRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return (
    Object.keys(candidate).sort().join(',') === 'category,source,status' &&
    typeof candidate.category === 'string' &&
    (CONSENT_CATEGORIES as readonly string[]).includes(candidate.category) &&
    (candidate.status === 'GRANTED' || candidate.status === 'WITHDRAWN') &&
    typeof candidate.source === 'string' &&
    (CONSENT_SOURCES as readonly string[]).includes(candidate.source)
  );
}

async function upstreamFailure(upstream: Response, fallback: string): Promise<NextResponse> {
  const message = await boundedUpstreamMessage(upstream, fallback);
  return noStoreJson({ message }, publicUpstreamStatus(upstream.status));
}

function unauthenticated(): NextResponse {
  return noStoreJson({ message: 'Your session has expired. Sign in again.' }, 401);
}
