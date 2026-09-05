import { decidePlatformRotation, PlatformSessionPolicyContext } from './platform-session-policy';

function baseContext(
  overrides: Partial<PlatformSessionPolicyContext> = {},
): PlatformSessionPolicyContext {
  const now = new Date('2026-09-05T00:00:00.000Z');
  return {
    sessionStatus: 'ACTIVE',
    sessionRevokedAt: null,
    sessionLockedAt: null,
    expiresAt: new Date(now.getTime() + 3600_000),
    absoluteExpiresAt: new Date(now.getTime() + 86_400_000),
    credentialState: 'ACTIVE',
    credentialRevokedAt: null,
    platformAccountStatus: 'ACTIVE',
    platformAccountDeletedAt: null,
    hasActivePlatformRoleAssignment: true,
    userStatus: 'ACTIVE',
    userDeletedAt: null,
    now,
    ...overrides,
  };
}

describe('decidePlatformRotation', () => {
  it('rotates an active platform session with an active platform chain', () => {
    expect(decidePlatformRotation(baseContext())).toEqual({ outcome: 'ROTATED' });
  });

  it('denies a suspended platform account (PLATFORM_ACCESS_DISABLED)', () => {
    expect(decidePlatformRotation(baseContext({ platformAccountStatus: 'SUSPENDED' }))).toEqual({
      outcome: 'PLATFORM_ACCESS_DISABLED',
    });
  });

  it('denies a platform account with no live role assignment', () => {
    expect(decidePlatformRotation(baseContext({ hasActivePlatformRoleAssignment: false }))).toEqual(
      { outcome: 'PLATFORM_ACCESS_DISABLED' },
    );
  });

  it('denies an inactive global user', () => {
    expect(decidePlatformRotation(baseContext({ userStatus: 'INACTIVE' }))).toEqual({
      outcome: 'PLATFORM_ACCESS_DISABLED',
    });
  });

  it('escalates a USED credential to REPLAY_DETECTED', () => {
    expect(decidePlatformRotation(baseContext({ credentialState: 'USED' }))).toEqual({
      outcome: 'REPLAY_DETECTED',
    });
  });

  it('rejects a REVOKED credential as REVOKED (no replay escalation)', () => {
    expect(
      decidePlatformRotation(
        baseContext({
          credentialState: 'REVOKED',
          credentialRevokedAt: new Date('2026-09-04T00:00:00.000Z'),
        }),
      ),
    ).toEqual({ outcome: 'REVOKED' });
  });

  it('rejects an UNKNOWN credential as INVALID without revoking the family', () => {
    expect(decidePlatformRotation(baseContext({ credentialState: 'UNKNOWN' }))).toEqual({
      outcome: 'INVALID',
    });
  });

  it('rejects an expired session', () => {
    const now = new Date('2026-09-05T00:00:00.000Z');
    expect(
      decidePlatformRotation(baseContext({ expiresAt: new Date(now.getTime() - 1), now })),
    ).toEqual({ outcome: 'EXPIRED' });
  });

  it('rejects a locked platform session through the normal refresh path', () => {
    expect(
      decidePlatformRotation(
        baseContext({ sessionLockedAt: new Date('2026-09-05T00:00:00.000Z') }),
      ),
    ).toEqual({ outcome: 'LOCKED' });
  });

  it('rejects a compromised platform session as revocable-terminal', () => {
    expect(decidePlatformRotation(baseContext({ sessionStatus: 'COMPROMISED' }))).toEqual({
      outcome: 'REVOKED',
    });
  });
});
