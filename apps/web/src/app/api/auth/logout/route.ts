import { NextRequest, NextResponse } from 'next/server';
import { authApiUrl, isSameOriginMutation, upstreamHeaders } from '@/lib/auth-api';
import { clearSessionCookies } from '@/lib/session-cookies';
import { ACCESS_COOKIE } from '@/lib/session-profile';

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ message: 'Cross-origin request rejected.' }, { status: 403 });
  }

  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  if (accessToken) {
    try {
      await fetch(authApiUrl('/auth/logout'), {
        method: 'POST',
        headers: upstreamHeaders(request, accessToken),
        cache: 'no-store',
      });
    } catch {
      // Local credentials are still cleared when the upstream service is unavailable.
    }
  }

  const response = NextResponse.json({ message: 'Signed out.' });
  clearSessionCookies(response);
  return response;
}
