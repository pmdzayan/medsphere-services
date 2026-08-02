import { NextRequest, NextResponse } from 'next/server';
import {
  authApiUrl,
  boundedUpstreamMessage,
  isSameOriginMutation,
  noStoreJson,
  publicUpstreamStatus,
  upstreamHeaders,
} from '@/lib/auth-api';
import { isAssignmentResponse } from '@/lib/authorization-contract';
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
    return noStoreJson({ message: 'Cross-origin request rejected.' }, 403);
  const { membershipId, roleId } = await context.params;
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!accessToken) return noStoreJson({ message: 'Your session has expired.' }, 401);
  if (!uuid.test(membershipId) || !uuid.test(roleId))
    return noStoreJson({ message: 'Invalid assignment identifier.' }, 400);
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
      return noStoreJson({ message }, publicUpstreamStatus(upstream.status));
    }
    if (method === 'DELETE') {
      return new NextResponse(null, {
        status: 204,
        headers: { 'cache-control': 'no-store' },
      });
    }
    const assignment: unknown = await upstream.json();
    if (
      !isAssignmentResponse(assignment) ||
      assignment.membershipId !== membershipId ||
      assignment.roleId !== roleId
    ) {
      return noStoreJson({ message: 'Authorization service returned an invalid response.' }, 502);
    }
    return noStoreJson(assignment, 200);
  } catch {
    return noStoreJson({ message: 'Authorization service is unavailable.' }, 503);
  }
}
