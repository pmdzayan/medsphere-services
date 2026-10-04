import { NextResponse, type NextRequest } from 'next/server';

import {
  WEB_CLIENT_GENERATION_COOKIE,
  evaluateWebClientCompatibility,
  isBrowserApiRequest,
  resolveMinimumWebClientGeneration,
} from './lib/client-version-policy';

function upgradeRequired(
  reason: 'missing' | 'invalid' | 'outdated',
  minimumGeneration: number,
): NextResponse {
  return NextResponse.json(
    {
      code: 'AIM_CLIENT_UPDATE_REQUIRED',
      message: 'This AIM client must be updated before API access can continue.',
      reason,
      minimumClientGeneration: minimumGeneration,
    },
    {
      status: 426,
      headers: {
        'cache-control': 'no-store',
        'x-aim-min-client-generation': String(minimumGeneration),
      },
    },
  );
}

function policyUnavailable(): NextResponse {
  return NextResponse.json(
    {
      code: 'AIM_CLIENT_POLICY_UNAVAILABLE',
      message: 'AIM client compatibility policy is temporarily unavailable.',
    },
    {
      status: 503,
      headers: { 'cache-control': 'no-store' },
    },
  );
}

export function enforceMinimumWebClient(
  request: NextRequest,
  environment: Readonly<Record<string, string | undefined>> = process.env,
): NextResponse {
  if (!isBrowserApiRequest(request.headers)) return NextResponse.next();

  let minimumGeneration: number;
  try {
    minimumGeneration = resolveMinimumWebClientGeneration(environment);
  } catch {
    return policyUnavailable();
  }

  const result = evaluateWebClientCompatibility(
    request.cookies.get(WEB_CLIENT_GENERATION_COOKIE)?.value,
    minimumGeneration,
  );

  if (!result.supported) {
    return upgradeRequired(result.reason, result.minimumGeneration);
  }

  return NextResponse.next();
}

export function middleware(request: NextRequest): NextResponse {
  return enforceMinimumWebClient(request);
}

export const config = {
  matcher: ['/api/:path*'],
};
