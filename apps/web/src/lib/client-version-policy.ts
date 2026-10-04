export const WEB_CLIENT_GENERATION_COOKIE = 'aim_web_client_generation';
export const WEB_CLIENT_GENERATION_MAX = 1_000_000_000;
export const DEFAULT_WEB_CLIENT_GENERATION = 1;
export const DEFAULT_MINIMUM_WEB_CLIENT_GENERATION = 1;

export type WebClientCompatibility =
  | { supported: true; clientGeneration: number; minimumGeneration: number }
  | {
      supported: false;
      reason: 'missing' | 'invalid' | 'outdated';
      clientGeneration: number | null;
      minimumGeneration: number;
    };

export function parseWebClientGeneration(value: string | null | undefined): number | null {
  if (!value || !/^\d{1,10}$/.test(value)) return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > WEB_CLIENT_GENERATION_MAX) {
    return null;
  }
  return parsed;
}

export function resolveMinimumWebClientGeneration(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): number {
  const configured = environment.AIM_WEB_MIN_CLIENT_GENERATION?.trim();
  if (!configured) return DEFAULT_MINIMUM_WEB_CLIENT_GENERATION;

  const parsed = parseWebClientGeneration(configured);
  if (parsed === null) {
    throw new Error(
      `AIM_WEB_MIN_CLIENT_GENERATION must be an integer between 1 and ${WEB_CLIENT_GENERATION_MAX}`,
    );
  }
  return parsed;
}

export function evaluateWebClientCompatibility(
  clientGenerationValue: string | null | undefined,
  minimumGeneration: number,
): WebClientCompatibility {
  if (
    !Number.isSafeInteger(minimumGeneration) ||
    minimumGeneration < 1 ||
    minimumGeneration > WEB_CLIENT_GENERATION_MAX
  ) {
    throw new Error('minimum web client generation is invalid');
  }

  if (
    clientGenerationValue === null ||
    clientGenerationValue === undefined ||
    clientGenerationValue === ''
  ) {
    return {
      supported: false,
      reason: 'missing',
      clientGeneration: null,
      minimumGeneration,
    };
  }

  const clientGeneration = parseWebClientGeneration(clientGenerationValue);
  if (clientGeneration === null) {
    return {
      supported: false,
      reason: 'invalid',
      clientGeneration: null,
      minimumGeneration,
    };
  }

  if (clientGeneration < minimumGeneration) {
    return {
      supported: false,
      reason: 'outdated',
      clientGeneration,
      minimumGeneration,
    };
  }

  return { supported: true, clientGeneration, minimumGeneration };
}

export function isBrowserApiRequest(headers: Pick<Headers, 'get'>): boolean {
  const fetchSite = headers.get('sec-fetch-site');
  return fetchSite === 'same-origin' || fetchSite === 'same-site' || fetchSite === 'none';
}
