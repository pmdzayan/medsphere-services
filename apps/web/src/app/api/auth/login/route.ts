import { NextRequest, NextResponse } from 'next/server';
import type { LoginRequest, LoginResponse } from '@/lib/auth-contract';
import { normalizeTenantSlug, validateLoginRequest } from '@/lib/auth-contract';

const authApiUrl = process.env.AUTH_API_URL ?? 'http://localhost:3000';

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: LoginRequest;
  try {
    body = (await request.json()) as LoginRequest;
  } catch {
    return NextResponse.json({ message: 'Invalid request body.' }, { status: 400 });
  }

  const normalized = {
    tenantSlug: normalizeTenantSlug(typeof body.tenantSlug === 'string' ? body.tenantSlug : ''),
    email: typeof body.email === 'string' ? body.email.trim().toLowerCase() : '',
    password: typeof body.password === 'string' ? body.password : '',
  };
  if (Object.keys(validateLoginRequest(normalized)).length > 0) {
    return NextResponse.json({ message: 'Invalid sign-in request.' }, { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${authApiUrl}/auth/login`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': request.headers.get('user-agent') ?? 'medsphere-web',
        'x-request-id': request.headers.get('x-request-id') ?? crypto.randomUUID(),
      },
      body: JSON.stringify(normalized),
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json(
      { message: 'Authentication service is unavailable.' },
      { status: 503 },
    );
  }

  if (!upstream.ok) {
    return NextResponse.json(
      {
        message:
          upstream.status === 401
            ? 'The organization, email, or password is incorrect.'
            : 'Sign-in failed. Try again.',
      },
      { status: upstream.status >= 500 ? 502 : upstream.status },
    );
  }

  let session: LoginResponse;
  try {
    const payload: unknown = await upstream.json();
    if (!isLoginResponse(payload)) {
      throw new Error('Invalid authentication response');
    }
    session = payload;
  } catch {
    return NextResponse.json(
      { message: 'Authentication service returned an invalid response.' },
      { status: 502 },
    );
  }
  const response = NextResponse.json({
    expiresIn: session.expiresIn,
    user: session.user,
    context: session.context,
  });
  const secure = process.env.NODE_ENV === 'production';
  response.cookies.set('medsphere_access', session.accessToken, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: session.expiresIn,
  });
  response.cookies.set('medsphere_refresh', session.refreshToken, {
    httpOnly: true,
    secure,
    sameSite: 'strict',
    path: '/api/auth',
  });
  return response;
}

function isLoginResponse(value: unknown): value is LoginResponse {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<LoginResponse>;
  return (
    typeof candidate.accessToken === 'string' &&
    candidate.accessToken.length > 0 &&
    typeof candidate.refreshToken === 'string' &&
    candidate.refreshToken.length > 0 &&
    typeof candidate.expiresIn === 'number' &&
    Number.isSafeInteger(candidate.expiresIn) &&
    candidate.expiresIn > 0 &&
    Boolean(candidate.user && typeof candidate.user.id === 'string') &&
    Boolean(candidate.context && typeof candidate.context.tenantId === 'string') &&
    Boolean(candidate.context && typeof candidate.context.membershipId === 'string')
  );
}
