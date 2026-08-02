// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { readSessionProfile, sealSessionProfile, type SessionProfile } from './session-profile';

const profile: SessionProfile = {
  tenantSlug: 'central-pharmacy',
  expiresIn: 900,
  user: {
    id: 'user-id',
    email: 'admin@example.com',
    firstName: 'Aisha',
    lastName: 'Zahra',
  },
  context: { membershipId: 'membership-id', tenantId: 'tenant-id' },
};

describe('sealed session profile', () => {
  it('round-trips non-sensitive session context using the access credential as integrity key', () => {
    const sealed = sealSessionProfile(profile, 'access-secret');

    expect(readSessionProfile(sealed, 'access-secret')).toEqual(profile);
    expect(sealed).not.toContain('admin@example.com');
  });

  it('rejects a modified profile or a different access credential', () => {
    const sealed = sealSessionProfile(profile, 'access-secret');

    expect(readSessionProfile(`${sealed}x`, 'access-secret')).toBeNull();
    expect(readSessionProfile(sealed, 'different-secret')).toBeNull();
  });

  it('rejects malformed profile data without throwing', () => {
    expect(readSessionProfile('not-a-profile', 'access-secret')).toBeNull();
    expect(readSessionProfile(undefined, 'access-secret')).toBeNull();
  });
});
