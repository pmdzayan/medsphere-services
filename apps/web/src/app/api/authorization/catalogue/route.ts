import { NextRequest, NextResponse } from 'next/server';
import {
  authApiUrl,
  boundedUpstreamMessage,
  publicUpstreamStatus,
  upstreamHeaders,
} from '@/lib/auth-api';
import {
  AUTHORIZATION_PERMISSIONS,
  isAuthorizationCatalogue,
  isEffectivePermissionsResponse,
} from '@/lib/authorization-contract';
import { ACCESS_COOKIE } from '@/lib/session-profile';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!accessToken) {
    return noStore({ message: 'Your session has expired. Sign in again.' }, 401);
  }

  let effectiveResponse: Response;
  try {
    effectiveResponse = await fetch(authApiUrl('/authorization/effective-permissions'), {
      headers: upstreamHeaders(request, accessToken),
      cache: 'no-store',
    });
  } catch {
    return noStore({ message: 'Authorization service is unavailable.' }, 503);
  }

  if (!effectiveResponse.ok) {
    const message = await boundedUpstreamMessage(
      effectiveResponse,
      'Unable to resolve your access controls.',
    );
    return noStore({ message }, publicUpstreamStatus(effectiveResponse.status));
  }

  try {
    const effectivePayload: unknown = await effectiveResponse.json();
    if (!isEffectivePermissionsResponse(effectivePayload)) {
      throw new Error('Invalid effective permissions');
    }

    const effective = new Set(effectivePayload.permissionKeys);
    let rolesResponse: Response | null;
    let permissionsResponse: Response | null;
    try {
      [rolesResponse, permissionsResponse] = await Promise.all([
        effective.has(AUTHORIZATION_PERMISSIONS.rolesRead)
          ? fetch(authApiUrl('/authorization/roles?limit=100&offset=0'), {
              headers: upstreamHeaders(request, accessToken),
              cache: 'no-store',
            })
          : Promise.resolve(null),
        effective.has(AUTHORIZATION_PERMISSIONS.permissionsRead)
          ? fetch(authApiUrl('/authorization/permissions'), {
              headers: upstreamHeaders(request, accessToken),
              cache: 'no-store',
            })
          : Promise.resolve(null),
      ]);
    } catch {
      return noStore({ message: 'Authorization service is unavailable.' }, 503);
    }

    const failed = [rolesResponse, permissionsResponse].find(
      (response): response is Response => response !== null && !response.ok,
    );
    if (failed) {
      const message = await boundedUpstreamMessage(failed, 'Unable to load access controls.');
      return noStore({ message }, publicUpstreamStatus(failed.status));
    }

    const rolesPayload: unknown = rolesResponse
      ? await rolesResponse.json()
      : { data: [], total: 0 };
    const permissionsPayload: unknown = permissionsResponse ? await permissionsResponse.json() : [];
    if (!rolesPayload || typeof rolesPayload !== 'object')
      throw new Error('Invalid role catalogue');
    const roles = rolesPayload as { data?: unknown; total?: unknown };
    const catalogue: unknown = {
      roles: roles.data,
      permissions: permissionsPayload,
      total: roles.total,
      effectivePermissions: effectivePayload.permissionKeys,
    };
    if (!isAuthorizationCatalogue(catalogue)) {
      throw new Error('Invalid authorization contract');
    }
    return noStore(catalogue, 200);
  } catch {
    return noStore({ message: 'Authorization service returned an invalid response.' }, 502);
  }
}

function noStore(body: unknown, status: number): NextResponse {
  const response = NextResponse.json(body, { status });
  response.headers.set('cache-control', 'no-store');
  return response;
}
