import { NextResponse, type NextRequest } from 'next/server';

const DEVELOPMENT_AUTH_API_URL = 'http://localhost:3000';

function isLoopbackHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    normalized === 'localhost' ||
    normalized === '127.0.0.1' ||
    normalized === '0.0.0.0' ||
    normalized === '::1' ||
    normalized === '[::1]'
  );
}

export function resolveAuthApiBaseUrl(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): string {
  const configured = environment.AUTH_API_URL?.trim();

  if (!configured) {
    if (environment.NODE_ENV === 'production') {
      throw new Error('AUTH_API_URL is required in production');
    }
    return DEVELOPMENT_AUTH_API_URL;
  }

  if (!/^https?:\/\//i.test(configured)) {
    throw new Error('AUTH_API_URL must be an absolute HTTP(S) URL');
  }

  let parsed: URL;
  try {
    parsed = new URL(configured);
  } catch {
    throw new Error('AUTH_API_URL must be an absolute HTTP(S) URL');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('AUTH_API_URL must use http:// or https://');
  }

  if (parsed.username || parsed.password) {
    throw new Error('AUTH_API_URL must not contain embedded credentials');
  }

  if (parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error('AUTH_API_URL must contain only an origin');
  }

  if (environment.NODE_ENV === 'production' && isLoopbackHost(parsed.hostname)) {
    throw new Error('AUTH_API_URL must not target a loopback host in production');
  }

  return parsed.origin;
}

export function authApiUrl(path: string): string {
  if (!path.startsWith('/')) {
    throw new Error('Auth API path must start with /');
  }

  return `${resolveAuthApiBaseUrl()}${path}`;
}

export function upstreamHeaders(request: NextRequest, accessToken?: string): Headers {
  const headers = new Headers({
    accept: 'application/json',
    'user-agent': request.headers.get('user-agent') ?? 'medsphere-web',
    'x-request-id': request.headers.get('x-request-id') ?? crypto.randomUUID(),
  });
  if (accessToken) {
    headers.set('authorization', `Bearer ${accessToken}`);
  }
  return headers;
}

export function isSameOriginMutation(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  return origin !== null && origin === request.nextUrl.origin;
}

export async function boundedUpstreamMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  try {
    const payload: unknown = await response.json();
    if (payload && typeof payload === 'object') {
      const candidate = payload as { error?: { message?: unknown }; message?: unknown };
      const value = candidate.error?.message ?? candidate.message;
      if (typeof value === 'string' && value.trim().length > 0) {
        return value.trim().slice(0, 240);
      }
    }
  } catch {
    // The bounded fallback intentionally hides upstream transport details.
  }
  return fallback;
}

export function publicUpstreamStatus(status: number): number {
  if (status === 401 || status === 403 || status === 409 || status === 412 || status === 428) {
    return status;
  }
  if (status >= 400 && status < 500) {
    return 400;
  }
  return 502;
}

export function noStoreJson(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, { status, headers: { 'cache-control': 'no-store' } });
}
