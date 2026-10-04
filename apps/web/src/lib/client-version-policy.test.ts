import { describe, expect, it } from 'vitest';

import {
  evaluateWebClientCompatibility,
  isBrowserApiRequest,
  parseWebClientGeneration,
  resolveMinimumWebClientGeneration,
} from './client-version-policy';

describe('UM14.5 web client generation policy', () => {
  it('accepts bounded positive integer generations only', () => {
    expect(parseWebClientGeneration('1')).toBe(1);
    expect(parseWebClientGeneration('1000000000')).toBe(1_000_000_000);
    expect(parseWebClientGeneration('0')).toBeNull();
    expect(parseWebClientGeneration('-1')).toBeNull();
    expect(parseWebClientGeneration('1.5')).toBeNull();
    expect(parseWebClientGeneration('1000000001')).toBeNull();
    expect(parseWebClientGeneration('latest')).toBeNull();
  });

  it('defaults minimum generation to one and rejects malformed configuration', () => {
    expect(resolveMinimumWebClientGeneration({})).toBe(1);
    expect(resolveMinimumWebClientGeneration({ AIM_WEB_MIN_CLIENT_GENERATION: '4' })).toBe(4);
    expect(() =>
      resolveMinimumWebClientGeneration({ AIM_WEB_MIN_CLIENT_GENERATION: 'latest' }),
    ).toThrow(/must be an integer/);
  });

  it('fails closed for missing, invalid and outdated browser client generations', () => {
    expect(evaluateWebClientCompatibility(undefined, 3)).toEqual({
      supported: false,
      reason: 'missing',
      clientGeneration: null,
      minimumGeneration: 3,
    });
    expect(evaluateWebClientCompatibility('latest', 3)).toEqual({
      supported: false,
      reason: 'invalid',
      clientGeneration: null,
      minimumGeneration: 3,
    });
    expect(evaluateWebClientCompatibility('2', 3)).toEqual({
      supported: false,
      reason: 'outdated',
      clientGeneration: 2,
      minimumGeneration: 3,
    });
    expect(evaluateWebClientCompatibility('3', 3)).toEqual({
      supported: true,
      clientGeneration: 3,
      minimumGeneration: 3,
    });
    expect(evaluateWebClientCompatibility('4', 3)).toEqual({
      supported: true,
      clientGeneration: 4,
      minimumGeneration: 3,
    });
  });

  it('scopes the browser compatibility gate to browser-like requests', () => {
    const browserHeaders = new Headers({
      'sec-fetch-site': 'same-origin',
      'sec-fetch-mode': 'cors',
    });
    const serverHeaders = new Headers({ accept: 'application/json' });

    expect(isBrowserApiRequest(browserHeaders)).toBe(true);
    expect(isBrowserApiRequest(serverHeaders)).toBe(false);
  });
});
