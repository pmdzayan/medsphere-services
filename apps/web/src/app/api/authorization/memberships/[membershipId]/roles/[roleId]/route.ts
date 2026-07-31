import { NextRequest, NextResponse } from 'next/server';
import {
  authApiUrl,
  boundedUpstreamMessage,
  isSameOriginMutation,
  publicUpstreamStatus,
  upstreamHeaders,
} from '@/lib/auth-api';
import { ACCESS_COOKIE } from '@/lib/session-profile';

type Context = { params: Promise<{ membershipId: string; roleId: string }> };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function PUT(request: NextRequest, context: Context) {
  return mutate(request, context, 'PUT');
}
export async function DELETE(request: NextRequest, context: Context) {
  return mutate(request, context, 'DELETE');
}

async function mutate(
  request: NextRequest,
  context: Context,
  method: 'PUT' | 'DELETE',
): Promise<NextResponse> {
  if (!isSameOriginMutation(request))
    return NextResponse.json({ message: 'Cross-origin request rejected.' }, { status: 403 });
  const { membershipId, roleId } = await context.params;
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!accessToken)
    return NextResponse.json({ message: 'Your session has expired.' }, { status: 401 });
  if (!uuid.test(membershipId) || !uuid.test(roleId))
    return NextResponse.json({ message: 'Invalid assignment identifier.' }, { status: 400 });
  try {
    const upstream = await fetch(
      authApiUrl(`/authorization/memberships/${membershipId}/roles/${roleId}`),
      {
        method,
        headers: upstreamHeaders(request, accessToken),
        cache: 'no-store',
      },
    );
    if (!upstream.ok) {
      const message = await boundedUpstreamMessage(upstream, 'Unable to update role assignment.');
      return NextResponse.json({ message }, { status: publicUpstreamStatus(upstream.status) });
    }
    return method === 'DELETE'
      ? new NextResponse(null, { status: 204 })
      : NextResponse.json(await upstream.json());
  } catch {
    return NextResponse.json({ message: 'Authorization service is unavailable.' }, { status: 503 });
  }
}
