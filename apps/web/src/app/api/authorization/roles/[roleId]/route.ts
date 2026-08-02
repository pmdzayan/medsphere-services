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
  isRole,
  isRoleVersionRequest,
  isUpdateRoleRequest,
  type UpdateRoleRequest,
} from '@/lib/authorization-contract';
import { ACCESS_COOKIE } from '@/lib/session-profile';

type Context = { params: Promise<{ roleId: string }> };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function PATCH(request: NextRequest, context: Context): Promise<NextResponse> {
  return mutateRole(request, context, 'PATCH');
}

export async function DELETE(request: NextRequest, context: Context): Promise<NextResponse> {
  return mutateRole(request, context, 'DELETE');
}

async function mutateRole(
  request: NextRequest,
  context: Context,
  method: 'PATCH' | 'DELETE',
): Promise<NextResponse> {
  if (!isSameOriginMutation(request)) {
    return noStoreJson({ message: 'Cross-origin request rejected.' }, 403);
  }
  const { roleId } = await context.params;
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!uuid.test(roleId) || !accessToken) {
    return noStoreJson(
      { message: accessToken ? 'Invalid role identifier.' : 'Your session has expired.' },
      accessToken ? 400 : 401,
    );
  }

  let version: number;
  let update: UpdateRoleRequest | undefined;
  try {
    const candidate: unknown = await request.json();
    if (method === 'PATCH') {
      if (!isUpdateRoleRequest(candidate)) throw new Error();
      update = candidate;
      version = candidate.version;
    } else {
      if (!isRoleVersionRequest(candidate)) throw new Error();
      version = candidate.version;
    }
  } catch {
    return noStoreJson({ message: 'A valid role mutation is required.' }, 400);
  }

  try {
    const headers = upstreamHeaders(request, accessToken);
    headers.set('if-match', `"${version}"`);
    if (method === 'PATCH') headers.set('content-type', 'application/json');
    const upstream = await fetch(authApiUrl(`/authorization/roles/${roleId}`), {
      method,
      headers,
      ...(method === 'PATCH'
        ? {
            body: JSON.stringify({
              name: update?.name,
              description: update?.description,
              permissionKeys: update?.permissionKeys,
            }),
          }
        : {}),
      cache: 'no-store',
    });
    if (!upstream.ok) {
      const message = await boundedUpstreamMessage(
        upstream,
        `Unable to ${method === 'PATCH' ? 'update' : 'delete'} role.`,
      );
      return noStoreJson({ message }, publicUpstreamStatus(upstream.status));
    }
    if (method === 'DELETE')
      return new NextResponse(null, {
        status: 204,
        headers: { 'cache-control': 'no-store' },
      });
    const role: unknown = await upstream.json();
    return isRole(role)
      ? noStoreJson(role, 200)
      : noStoreJson({ message: 'Authorization service returned an invalid response.' }, 502);
  } catch {
    return noStoreJson({ message: 'Authorization service is unavailable.' }, 503);
  }
}
