import { describe, expect, it } from 'vitest';

import {
  apiCompatibilityHeaders,
  enforceApiCompatibility,
  readApiCompatibilityPolicy,
} from './api-compatibility';

const environment = {
  AIM_MIN_API_GENERATION: '7',
  AIM_MAX_API_GENERATION: '9',
} as NodeJS.ProcessEnv;

describe('UM14.7 API compatibility policy', () => {
  it('accepts every generation inside the controlled overlap window', () => {
    expect(enforceApiCompatibility('7', environment)).toEqual({ ok: true, generation: 7 });
    expect(enforceApiCompatibility('8', environment)).toEqual({ ok: true, generation: 8 });
    expect(enforceApiCompatibility('9', environment)).toEqual({ ok: true, generation: 9 });
  });

  it('rejects missing, malformed, stale and future client generations with 426', () => {
    for (const candidate of [undefined, '', '6', '10', '7.0', '-1', '999999999999999999999']) {
      expect(enforceApiCompatibility(candidate, environment)).toMatchObject({
        ok: false,
        status: 426,
        code: 'API_CLIENT_UNSUPPORTED',
      });
    }
  });

  it('fails closed when the server policy is absent, malformed or reversed', () => {
    for (const candidate of [
      {},
      { AIM_MIN_API_GENERATION: 'x', AIM_MAX_API_GENERATION: '9' },
      { AIM_MIN_API_GENERATION: '10', AIM_MAX_API_GENERATION: '9' },
    ]) {
      expect(enforceApiCompatibility('8', candidate as NodeJS.ProcessEnv)).toEqual({
        ok: false,
        status: 503,
        code: 'API_COMPATIBILITY_POLICY_INVALID',
      });
    }
  });

  it('publishes only bounded compatibility metadata', () => {
    const policy = readApiCompatibilityPolicy(environment);
    expect(policy).not.toBeNull();
    expect(apiCompatibilityHeaders(policy!)).toEqual({
      'cache-control': 'no-store',
      'x-aim-min-api-generation': '7',
      'x-aim-max-api-generation': '9',
    });
  });
});
