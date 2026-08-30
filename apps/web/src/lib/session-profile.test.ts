// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { readSessionProfile, sealSessionProfile, type SessionProfile } from './session-profile';

const profile: SessionProfile = {
  expiresIn: 900,
  user: {
    id: 'user-id',
    email: 'admin@example.com',
    firstName: 'Aisha',
    lastName: 'Zahra',
    preferredLanguage: 'en',
  },
  context: {
    membershipId: 'membership-id',
    tenantId: 'tenant-id',
    tenantName: 'Central Pharmacy',
    organizationType: 'PHARMACY',
  },
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

  it('keeps a signed legacy language preference readable during rollout', () => {
    const legacy = { ...profile, user: { ...profile.user, preferredLanguage: 'hi' as const } };
    const sealed = sealSessionProfile(legacy, 'access-secret');

    expect(readSessionProfile(sealed, 'access-secret')).toEqual(legacy);
  });

  it('defaults a pre-language session profile to English without invalidating it', () => {
    const { preferredLanguage: _preferredLanguage, ...legacyUser } = profile.user;
    expect(_preferredLanguage).toBe('en');
    const legacy = { ...profile, user: legacyUser };
    const sealed = sealSessionProfile(legacy as SessionProfile, 'access-secret');

    expect(readSessionProfile(sealed, 'access-secret')).toEqual({
      ...legacy,
      user: { ...legacyUser, preferredLanguage: 'en' },
    });
  });
});
