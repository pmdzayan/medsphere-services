import { describe, expect, it } from 'vitest';

import { enforceApiCompatibilityResponse } from './api-compatibility-response';

const environment = {
  AIM_MIN_API_GENERATION: '3',
  AIM_MAX_API_GENERATION: '4',
} as NodeJS.ProcessEnv;

describe('UM14.7 compatibility HTTP boundary', () => {
  it('allows a supported old or new client to continue', () => {
    expect(enforceApiCompatibilityResponse('3', environment)).toBeNull();
    expect(enforceApiCompatibilityResponse('4', environment)).toBeNull();
  });

  it('returns bounded 426 metadata for an unsupported client', async () => {
    const response = enforceApiCompatibilityResponse('2', environment)!;
    expect(response.status).toBe(426);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-aim-min-api-generation')).toBe('3');
    expect(response.headers.get('x-aim-max-api-generation')).toBe('4');
    await expect(response.json()).resolves.toEqual({
      error: { code: 'API_CLIENT_UNSUPPORTED', message: 'Client update required' },
    });
  });

  it('does not leak malformed server policy details', async () => {
    const response = enforceApiCompatibilityResponse('3', {} as NodeJS.ProcessEnv)!;
    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-aim-min-api-generation')).toBeNull();
    await expect(response.json()).resolves.toEqual({
      error: { code: 'API_COMPATIBILITY_POLICY_INVALID', message: 'Service unavailable' },
    });
  });
});
