import { describe, expect, it } from 'vitest';

import {
  isWorkstationLockRequest,
  isWorkstationLockResponse,
  isWorkstationSessionState,
  isWorkstationUnlockRequest,
} from './auth-contract';

describe('Task 0014 workstation auth contracts', () => {
  it('accepts only approved lock reasons', () => {
    expect(isWorkstationLockRequest({ reason: 'manual' })).toBe(true);
    expect(isWorkstationLockRequest({ reason: 'walked-away' })).toBe(true);
    expect(isWorkstationLockRequest({ reason: 'other' })).toBe(false);
    expect(isWorkstationLockRequest({ reason: 'manual', extra: true })).toBe(false);
  });

  it('accepts only the exact lock response', () => {
    expect(isWorkstationLockResponse({ locked: true })).toBe(true);
    expect(isWorkstationLockResponse({ locked: false })).toBe(false);
  });

  it('validates server-authoritative session state exactly', () => {
    expect(
      isWorkstationSessionState({
        locked: true,
        lockedAt: '2026-09-02T09:00:00.000Z',
        securityVersion: 2,
      }),
    ).toBe(true);

    expect(
      isWorkstationSessionState({
        locked: false,
        lockedAt: null,
        securityVersion: 2,
      }),
    ).toBe(true);

    expect(
      isWorkstationSessionState({
        locked: true,
        lockedAt: null,
        securityVersion: 2,
        extra: 'unsafe',
      }),
    ).toBe(false);
  });

  it('requires exactly one unlock credential and never accepts refreshToken', () => {
    expect(isWorkstationUnlockRequest({ password: '123456789012345' })).toBe(true);
    expect(isWorkstationUnlockRequest({ googleIdToken: 'google-proof' })).toBe(true);

    expect(isWorkstationUnlockRequest({})).toBe(false);
    expect(
      isWorkstationUnlockRequest({
        password: '123456789012345',
        googleIdToken: 'google-proof',
      }),
    ).toBe(false);

    expect(
      isWorkstationUnlockRequest({
        password: '123456789012345',
        refreshToken: 'must-never-come-from-browser',
      }),
    ).toBe(false);
  });
});
