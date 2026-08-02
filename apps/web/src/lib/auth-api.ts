import { NextResponse, type NextRequest } from 'next/server';

export function authApiUrl(path: string): string {
  const baseUrl = process.env.AUTH_API_URL ?? 'http://localhost:3000';
  return `${baseUrl.replace(/\/$/, '')}${path}`;
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
