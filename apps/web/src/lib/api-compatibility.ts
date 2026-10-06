export const AIM_API_GENERATION_HEADER = 'x-aim-api-generation';
export const AIM_MIN_API_GENERATION_HEADER = 'x-aim-min-api-generation';
export const AIM_MAX_API_GENERATION_HEADER = 'x-aim-max-api-generation';

const MAX_GENERATION = 2_147_483_647;

export type ApiCompatibilityPolicy = Readonly<{
  minimumGeneration: number;
  maximumGeneration: number;
}>;

export type ApiCompatibilityResult =
  | Readonly<{ ok: true; generation: number }>
  | Readonly<{
      ok: false;
      status: 426 | 503;
      code: 'API_CLIENT_UNSUPPORTED' | 'API_COMPATIBILITY_POLICY_INVALID';
    }>;

function parseGeneration(value: string | undefined): number | null {
  if (!value || !/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > MAX_GENERATION) return null;
  return parsed;
}

export function readApiCompatibilityPolicy(environment: NodeJS.ProcessEnv): ApiCompatibilityPolicy | null {
  const minimumGeneration = parseGeneration(environment.AIM_MIN_API_GENERATION);
  const maximumGeneration = parseGeneration(environment.AIM_MAX_API_GENERATION);

  if (
    minimumGeneration === null ||
    maximumGeneration === null ||
    minimumGeneration > maximumGeneration
  ) {
    return null;
  }

  return { minimumGeneration, maximumGeneration };
}

export function enforceApiCompatibility(
  rawGeneration: string | undefined,
  environment: NodeJS.ProcessEnv = process.env,
): ApiCompatibilityResult {
  const policy = readApiCompatibilityPolicy(environment);
  if (!policy) {
    return { ok: false, status: 503, code: 'API_COMPATIBILITY_POLICY_INVALID' };
  }

  const generation = parseGeneration(rawGeneration);
  if (
    generation === null ||
    generation < policy.minimumGeneration ||
    generation > policy.maximumGeneration
  ) {
    return { ok: false, status: 426, code: 'API_CLIENT_UNSUPPORTED' };
  }

  return { ok: true, generation };
}

export function apiCompatibilityHeaders(policy: ApiCompatibilityPolicy): Record<string, string> {
  return {
    'cache-control': 'no-store',
    [AIM_MIN_API_GENERATION_HEADER]: String(policy.minimumGeneration),
    [AIM_MAX_API_GENERATION_HEADER]: String(policy.maximumGeneration),
  };
}
