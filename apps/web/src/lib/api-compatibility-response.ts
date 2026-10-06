import { NextResponse } from 'next/server';

import {
  apiCompatibilityHeaders,
  enforceApiCompatibility,
  readApiCompatibilityPolicy,
} from './api-compatibility';

export function enforceApiCompatibilityResponse(
  generation: string | undefined,
  environment: NodeJS.ProcessEnv = process.env,
): NextResponse | null {
  const result = enforceApiCompatibility(generation, environment);
  if (result.ok) return null;

  const policy = readApiCompatibilityPolicy(environment);
  const headers = policy ? apiCompatibilityHeaders(policy) : { 'cache-control': 'no-store' };

  return NextResponse.json(
    { error: { code: result.code, message: result.status === 426 ? 'Client update required' : 'Service unavailable' } },
    { status: result.status, headers },
  );
}
