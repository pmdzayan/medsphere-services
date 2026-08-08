import { decideRotation, SessionPolicyContext } from './session-policy';

function baseContext(overrides: Partial<SessionPolicyContext> = {}): SessionPolicyContext {
  const now = new Date('2026-08-03T12:00:00.000Z');
  return {
    sessionStatus: 'ACTIVE',
    sessionRevokedAt: null,
    expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
    absoluteExpiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
    credentialState: 'ACTIVE',
    credentialRevokedAt: null,
    membershipStatus: 'ACTIVE',
    membershipDeletedAt: null,
    userStatus: 'ACTIVE',
    userDeletedAt: null,
    tenantIsActive: true,
    tenantDeletedAt: null,
    now,
    ...overrides,
  };
}

describe('decideRotation', () => {
  it('returns ROTATED for an active credential on an active identity chain', () => {
    expect(decideRotation(baseContext())).toEqual({ outcome: 'ROTATED' });
  });

  it('returns REPLAY_DETECTED for a used credential', () => {
    expect(decideRotation(baseContext({ credentialState: 'USED' }))).toEqual({
      outcome: 'REPLAY_DETECTED',
    });
  });

  it('treats a used credential as replay even after its rotated session expires', () => {
    const now = baseContext().now;
    expect(
      decideRotation(
        baseContext({
          sessionStatus: 'ROTATED',
          credentialState: 'USED',
          expiresAt: new Date(now.getTime() - 1000),
        }),
      ),
    ).toEqual({ outcome: 'REPLAY_DETECTED' });
  });

  it('returns REVOKED for a revoked credential', () => {
    expect(
      decideRotation(baseContext({ credentialState: 'REVOKED', credentialRevokedAt: new Date() })),
    ).toEqual({ outcome: 'REVOKED' });
  });

  it('returns INVALID for an unknown credential, not confirmed replay', () => {
    expect(decideRotation(baseContext({ credentialState: 'UNKNOWN' }))).toEqual({
      outcome: 'INVALID',
    });
  });

  it('returns EXPIRED when the idle expiry has passed', () => {
    const context = baseContext({
      expiresAt: new Date(baseContext().now.getTime() - 1000),
    });
    expect(decideRotation(context)).toEqual({ outcome: 'EXPIRED' });
  });

  it('returns EXPIRED when the absolute expiry has passed', () => {
    const context = baseContext({
      absoluteExpiresAt: new Date(baseContext().now.getTime() - 1000),
    });
    expect(decideRotation(context)).toEqual({ outcome: 'EXPIRED' });
  });

  it('returns REVOKED for a revoked session', () => {
    expect(
      decideRotation(baseContext({ sessionStatus: 'REVOKED', sessionRevokedAt: new Date() })),
    ).toEqual({ outcome: 'REVOKED' });
  });

  it('returns REVOKED for a compromised session', () => {
    expect(decideRotation(baseContext({ sessionStatus: 'COMPROMISED' }))).toEqual({
      outcome: 'REVOKED',
    });
  });

  it('returns IDENTITY_DISABLED for a disabled user', () => {
    expect(decideRotation(baseContext({ userStatus: 'SUSPENDED' }))).toEqual({
      outcome: 'IDENTITY_DISABLED',
    });
  });

  it('returns IDENTITY_DISABLED for a deleted user', () => {
    expect(decideRotation(baseContext({ userDeletedAt: new Date() }))).toEqual({
      outcome: 'IDENTITY_DISABLED',
    });
  });

  it('returns IDENTITY_DISABLED for a disabled membership', () => {
    expect(decideRotation(baseContext({ membershipStatus: 'SUSPENDED' }))).toEqual({
      outcome: 'IDENTITY_DISABLED',
    });
  });

  it('returns IDENTITY_DISABLED for a deleted membership', () => {
    expect(decideRotation(baseContext({ membershipDeletedAt: new Date() }))).toEqual({
      outcome: 'IDENTITY_DISABLED',
    });
  });

  it('returns IDENTITY_DISABLED for an inactive tenant', () => {
    expect(decideRotation(baseContext({ tenantIsActive: false }))).toEqual({
      outcome: 'IDENTITY_DISABLED',
    });
  });

  it('returns IDENTITY_DISABLED for a deleted tenant', () => {
    expect(decideRotation(baseContext({ tenantDeletedAt: new Date() }))).toEqual({
      outcome: 'IDENTITY_DISABLED',
    });
  });

  it('returns INVALID for a ROTATED session with an active credential', () => {
    expect(decideRotation(baseContext({ sessionStatus: 'ROTATED' }))).toEqual({
      outcome: 'INVALID',
    });
  });
});
