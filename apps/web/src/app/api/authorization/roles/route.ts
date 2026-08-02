import { NextRequest, NextResponse } from 'next/server';
import {
  authApiUrl,
  boundedUpstreamMessage,
  isSameOriginMutation,
  noStoreJson,
  publicUpstreamStatus,
  upstreamHeaders,
} from '@/lib/auth-api';
import { isCreateRoleRequest, isRole, type CreateRoleRequest } from '@/lib/authorization-contract';
import { ACCESS_COOKIE } from '@/lib/session-profile';

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isSameOriginMutation(request)) {
    return noStoreJson({ message: 'Cross-origin request rejected.' }, 403);
  }
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!accessToken) {
    return noStoreJson({ message: 'Your session has expired. Sign in again.' }, 401);
  }

  let body: CreateRoleRequest;
  try {
    const payload: unknown = await request.json();
    if (!isCreateRoleRequest(payload)) {
      throw new Error('Invalid role request');
    }
    body = payload;
  } catch {
    return noStoreJson({ message: 'Invalid role request.' }, 400);
  }

  let upstream: Response;
  try {
    const headers = upstreamHeaders(request, accessToken);
    headers.set('content-type', 'application/json');
    upstream = await fetch(authApiUrl('/authorization/roles'), {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      cache: 'no-store',
    });
  } catch {
    return noStoreJson({ message: 'Authorization service is unavailable.' }, 503);
  }

  if (!upstream.ok) {
    const message = await boundedUpstreamMessage(upstream, 'Unable to create role.');
    return noStoreJson({ message }, publicUpstreamStatus(upstream.status));
  }

  try {
    const role: unknown = await upstream.json();
    if (!isRole(role)) {
      throw new Error('Invalid role response');
    }
    return noStoreJson(role, 201);
  } catch {
    return noStoreJson({ message: 'Authorization service returned an invalid response.' }, 502);
  }
}
