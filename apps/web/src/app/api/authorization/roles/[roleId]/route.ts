import { NextRequest, NextResponse } from 'next/server';
import {
  authApiUrl,
  boundedUpstreamMessage,
  isSameOriginMutation,
  publicUpstreamStatus,
  upstreamHeaders,
} from '@/lib/auth-api';
import { isRole, type UpdateRoleRequest } from '@/lib/authorization-contract';
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
    return NextResponse.json({ message: 'Cross-origin request rejected.' }, { status: 403 });
  }
  const { roleId } = await context.params;
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!uuid.test(roleId) || !accessToken) {
    return NextResponse.json(
      { message: accessToken ? 'Invalid role identifier.' : 'Your session has expired.' },
      { status: accessToken ? 400 : 401 },
    );
  }

  let payload: Partial<UpdateRoleRequest>;
  try {
    payload = (await request.json()) as Partial<UpdateRoleRequest>;
    if (!Number.isSafeInteger(payload.version) || Number(payload.version) < 1) throw new Error();
  } catch {
    return NextResponse.json({ message: 'A valid role version is required.' }, { status: 400 });
  }

  try {
    const headers = upstreamHeaders(request, accessToken);
    headers.set('if-match', `"${payload.version}"`);
    if (method === 'PATCH') headers.set('content-type', 'application/json');
    const upstream = await fetch(authApiUrl(`/authorization/roles/${roleId}`), {
      method,
      headers,
      ...(method === 'PATCH'
        ? {
            body: JSON.stringify({
              name: payload.name,
              description: payload.description,
              permissionKeys: payload.permissionKeys,
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
      return NextResponse.json({ message }, { status: publicUpstreamStatus(upstream.status) });
    }
    if (method === 'DELETE') return new NextResponse(null, { status: 204 });
    const role: unknown = await upstream.json();
    return isRole(role)
      ? NextResponse.json(role)
      : NextResponse.json(
          { message: 'Authorization service returned an invalid response.' },
          { status: 502 },
        );
  } catch {
    return NextResponse.json({ message: 'Authorization service is unavailable.' }, { status: 503 });
  }
}
