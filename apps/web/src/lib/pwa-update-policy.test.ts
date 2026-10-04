import { describe, expect, it } from 'vitest';

import {
  WEB_UPDATE_CHECK_MIN_GAP_MS,
  parseWebReleasePolicy,
  shouldCheckForWebUpdate,
  webUpdatePresentation,
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

describe('UM14.4 optional-versus-required update policy', () => {
  const id = `git:${'a'.repeat(40)}`;
  const clientGeneration = 3;

  it('accepts bounded optional and required policies', () => {
    expect(
      parseWebReleasePolicy({
        id,
        clientGeneration,
        updateMode: 'optional',
        updateReason: 'routine',
      }),
    ).toEqual({
      id,
      clientGeneration,
      updateMode: 'optional',
      updateReason: 'routine',
    });

    expect(
      parseWebReleasePolicy({
        id,
        clientGeneration,
        updateMode: 'required',
        updateReason: 'security',
      }),
    ).toEqual({ id, clientGeneration, updateMode: 'required', updateReason: 'security' });

    expect(
      parseWebReleasePolicy({
        id,
        clientGeneration,
        updateMode: 'required',
        updateReason: 'incompatible',
      }),
    ).toEqual({ id, clientGeneration, updateMode: 'required', updateReason: 'incompatible' });
  });

  it('rejects malformed or contradictory release policy', () => {
    expect(
      parseWebReleasePolicy({ id: 'latest', updateMode: 'required', updateReason: 'security' }),
    ).toBeNull();
    expect(
      parseWebReleasePolicy({
        id,
        clientGeneration,
        updateMode: 'required',
        updateReason: 'routine',
      }),
    ).toBeNull();
    expect(
      parseWebReleasePolicy({
        id,
        clientGeneration,
        updateMode: 'optional',
        updateReason: 'incompatible',
      }),
    ).toBeNull();
    expect(
      parseWebReleasePolicy({
        id,
        clientGeneration,
        updateMode: 'force',
        updateReason: 'security',
      }),
    ).toBeNull();
  });

  it('allows Later only for optional releases', () => {
    expect(
      webUpdatePresentation({
        id,
        clientGeneration,
        updateMode: 'optional',
        updateReason: 'security',
      }),
    ).toEqual({ required: false, canDefer: true, reason: 'security' });

    expect(
      webUpdatePresentation({
        id,
        clientGeneration,
        updateMode: 'required',
        updateReason: 'security',
      }),
    ).toEqual({ required: true, canDefer: false, reason: 'security' });
  });

  it('keeps presentation fallback optional while UM14.5 server enforcement remains separate', () => {
    expect(webUpdatePresentation(null)).toEqual({
      required: false,
      canDefer: true,
      reason: 'routine',
    });
  });
});
