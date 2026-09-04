import { NotFoundException } from '@nestjs/common';
import { PatientProfileService } from './patient-profile.service';

const identityA = {
  userId: 'user-a',
  membershipId: 'membership-a',
  tenantId: 'tenant-a',
  sessionId: 'session-a',
  tokenId: 'token-a',
  securityVersion: 1,
};

function buildService() {
  const users = new Map<string, Record<string, unknown>>([
    [
      'user-a',
      {
        id: 'user-a',
        firstName: 'Asha',
        lastName: 'Rao',
        email: 'asha@example.com',
        phone: '+911234567890',
        phoneVerifiedAt: new Date('2026-01-01'),
        preferredLanguage: 'en',
        deletedAt: null,
        privacy: { wantsReservationNotifications: true, hideSensitiveNotifications: true },
      },
    ],
    [
      'user-b',
      {
        id: 'user-b',
        firstName: 'Bala',
        lastName: 'Krishnan',
        email: 'bala@example.com',
        phone: null,
        phoneVerifiedAt: null,
        preferredLanguage: 'ta',
        deletedAt: null,
        privacy: null,
      },
    ],
  ]);

  const client = {
    user: {
      findFirst: jest.fn().mockImplementation(({ where }: { where: { id: string } }) => {
        const user = users.get(where.id);
        return Promise.resolve(user ?? null);
      }),
      update: jest
        .fn()
        .mockImplementation(
          ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
            const user = users.get(where.id);
            if (!user) throw new Error('User not found');
            const { privacy: privacyUpdate, ...userFields } = data as {
              privacy?: {
                upsert: { create: Record<string, unknown>; update: Record<string, unknown> };
              };
            } & Record<string, unknown>;
            Object.assign(user, userFields);
            if (privacyUpdate) {
              user.privacy = { ...(user.privacy as object | null), ...privacyUpdate.upsert.update };
            }
            return Promise.resolve(user);
          },
        ),
    },
  };

  const prisma = { client };
  const audit = { appendPlatformUser: jest.fn().mockResolvedValue(undefined) };
  const service = new PatientProfileService(prisma as never, audit as never);
  return { service, users, audit, client };
}

describe('PatientProfileService -- identity scoping (candidate Task 0032)', () => {
  it("reads only the caller's own profile, keyed by identity.userId", async () => {
    const { service, client } = buildService();
    const profile = await service.getOwnProfile(identityA as never);

    expect(profile.userId).toBe('user-a');
    expect(profile.email).toBe('asha@example.com');
    expect(client.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'user-a', deletedAt: null } }),
    );
  });

  it('throws NotFoundException rather than leaking existence of a different user when the caller record is missing', async () => {
    const { service } = buildService();
    const missingIdentity = { ...identityA, userId: 'user-does-not-exist' };
    await expect(service.getOwnProfile(missingIdentity as never)).rejects.toThrow(
      NotFoundException,
    );
  });

  it("update is scoped exclusively to identity.userId -- there is no code path that can target another user's row", async () => {
    const { service, client, users } = buildService();
    await service.updateOwnProfile(identityA as never, { firstName: 'Ashwini' } as never);

    expect(client.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'user-a' } }),
    );
    // User B's record is completely untouched by an update performed
    // under identity A's token.
    expect(users.get('user-b')?.firstName).toBe('Bala');
  });

  it('mass assignment is impossible: fields not on UpdatePatientProfileDto never reach the database write', async () => {
    const { service, client } = buildService();
    // Simulate a caller attempting to smuggle server-managed fields
    // through the DTO object itself (bypassing class-validator's
    // whitelist at the controller layer, to prove defense-in-depth at
    // the service layer too).
    const maliciousDto = {
      firstName: 'Legit',
      email: 'attacker@example.com',
      phoneVerifiedAt: new Date('2099-01-01'),
      status: 'SUSPENDED',
      id: 'user-b',
    };

    await service.updateOwnProfile(identityA as never, maliciousDto as never);

    const writeCall = client.user.update.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(writeCall.data).not.toHaveProperty('email');
    expect(writeCall.data).not.toHaveProperty('phoneVerifiedAt');
    expect(writeCall.data).not.toHaveProperty('status');
    expect(writeCall.data).not.toHaveProperty('id');
    expect(writeCall.data.firstName).toBe('Legit');
  });

  it('updates the privacy relation only when a privacy field is actually supplied', async () => {
    const { service, client } = buildService();
    await service.updateOwnProfile(identityA as never, { firstName: 'Asha' } as never);
    const writeCall = client.user.update.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(writeCall.data).not.toHaveProperty('privacy');
  });

  it('records a platform-scoped (global, non-tenant) audit event for a profile update -- never tenant-attributed', async () => {
    const { service, audit } = buildService();
    await service.updateOwnProfile(identityA as never, { lastName: 'Ramesh' } as never);

    expect(audit.appendPlatformUser).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        eventType: 'patient.profile.updated',
        outcome: 'SUCCEEDED',
        platformActorUserId: 'user-a',
      }),
    );
    const auditCall = audit.appendPlatformUser.mock.calls[0][1] as Record<string, unknown>;
    expect(auditCall).not.toHaveProperty('tenantId');
    expect(auditCall).not.toHaveProperty('actorMembershipId');
  });

  it('never includes raw field values in audit metadata, only the names of fields changed', async () => {
    const { service, audit } = buildService();
    await service.updateOwnProfile(
      identityA as never,
      { firstName: 'Renamed', preferredLanguage: 'ta' } as never,
    );

    const auditCall = audit.appendPlatformUser.mock.calls[0][1] as {
      metadata: { fieldsChanged: string[] };
    };
    expect(auditCall.metadata.fieldsChanged).toEqual(
      expect.arrayContaining(['firstName', 'preferredLanguage']),
    );
    expect(JSON.stringify(auditCall.metadata)).not.toContain('Renamed');
  });
});
