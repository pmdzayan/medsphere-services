import { NextRequest, NextResponse } from 'next/server';
import {
  authApiUrl,
  boundedUpstreamMessage,
  isSameOriginMutation,
  publicUpstreamStatus,
  upstreamHeaders,
} from '@/lib/auth-api';
import { isRole, type CreateRoleRequest } from '@/lib/authorization-contract';
import { ACCESS_COOKIE } from '@/lib/session-profile';

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ message: 'Cross-origin request rejected.' }, { status: 403 });
  }
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!accessToken) {
    return NextResponse.json(
      { message: 'Your session has expired. Sign in again.' },
      { status: 401 },
    );
  }

  let body: CreateRoleRequest;
  try {
    const payload: unknown = await request.json();
    if (!isCreateRoleRequest(payload)) {
      throw new Error('Invalid role request');
    }
    body = payload;
  } catch {
    return NextResponse.json({ message: 'Invalid role request.' }, { status: 400 });
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
    return NextResponse.json({ message: 'Authorization service is unavailable.' }, { status: 503 });
  }

  if (!upstream.ok) {
    const message = await boundedUpstreamMessage(upstream, 'Unable to create role.');
    return NextResponse.json({ message }, { status: publicUpstreamStatus(upstream.status) });
  }

  try {
    const role: unknown = await upstream.json();
    if (!isRole(role)) {
      throw new Error('Invalid role response');
    }
    return NextResponse.json(role, { status: 201 });
  } catch {
    return NextResponse.json(
      { message: 'Authorization service returned an invalid response.' },
      { status: 502 },
    );
  }
}

function isCreateRoleRequest(value: unknown): value is CreateRoleRequest {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<CreateRoleRequest>;
  return (
    typeof candidate.name === 'string' &&
    candidate.name.length >= 3 &&
    candidate.name.length <= 64 &&
    (candidate.description === undefined ||
      (typeof candidate.description === 'string' && candidate.description.length <= 240)) &&
    Array.isArray(candidate.permissionKeys) &&
    candidate.permissionKeys.length <= 100 &&
    candidate.permissionKeys.every(
      (permission) => typeof permission === 'string' && permission.length <= 120,
    )
  );
}
