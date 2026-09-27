import { describe, expect, it } from 'vitest';

import {
  WEB_UPDATE_CHECK_MIN_GAP_MS,
  shouldCheckForWebUpdate,
} from './pwa-update-policy';

describe('UM14.3 web update check policy', () => {
  it('checks immediately when visible and online with no previous check', () => {
    expect(
      shouldCheckForWebUpdate({
        online: true,
        visibilityState: 'visible',
        lastCheckedAt: 0,
        now: 1000,
      }),
    ).toBe(true);
  });

  it('does not check while offline or hidden', () => {
    expect(
      shouldCheckForWebUpdate({
        online: false,
        visibilityState: 'visible',
        lastCheckedAt: 0,
        now: 1000,
      }),
    ).toBe(false);
    expect(
      shouldCheckForWebUpdate({
        online: true,
        visibilityState: 'hidden',
        lastCheckedAt: 0,
        now: 1000,
      }),
    ).toBe(false);
  });

  it('throttles repeated focus/reconnect checks', () => {
    expect(
      shouldCheckForWebUpdate({
        online: true,
        visibilityState: 'visible',
        lastCheckedAt: 1000,
        now: 1000 + WEB_UPDATE_CHECK_MIN_GAP_MS - 1,
      }),
    ).toBe(false);
    expect(
      shouldCheckForWebUpdate({
        online: true,
        visibilityState: 'visible',
        lastCheckedAt: 1000,
        now: 1000 + WEB_UPDATE_CHECK_MIN_GAP_MS,
      }),
    ).toBe(true);
  });

  it('fails open to a fresh check if the local clock moves backwards', () => {
    expect(
      shouldCheckForWebUpdate({
        online: true,
        visibilityState: 'visible',
        lastCheckedAt: 5000,
        now: 4000,
      }),
    ).toBe(true);
  });
});
