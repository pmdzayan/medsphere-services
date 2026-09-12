import { randomUUID } from 'node:crypto';

import type { Prisma } from '@medsphere/database';

import { AuditWriter } from '../audit/audit-writer.service';
import type { AuthenticatedIdentity } from '../auth/auth.types';
import { isInfrastructureTestEnabled, requireEnv } from '../auth/testing/infrastructure-test-gate';
import { PrismaService } from '../prisma/prisma.service';
import { PatientProfileService } from './patient-profile.service';

const describePatientProfileInfra = isInfrastructureTestEnabled() ? describe : describe.skip;

if (isInfrastructureTestEnabled()) {
  requireEnv('DATABASE_URL');
}

describePatientProfileInfra('PatientProfileService PostgreSQL isolation and atomicity', () => {
  const prisma = new PrismaService();
  const audit = new AuditWriter();
  const service = new PatientProfileService(prisma, audit);

  const userAId = randomUUID();
  const userBId = randomUUID();

  function identity(userId: string): AuthenticatedIdentity {
    return {
      userId,
      membershipId: randomUUID(),
      tenantId: randomUUID(),
      sessionId: randomUUID(),
      securityVersion: 1,
      tokenId: randomUUID(),
    };
  }

  beforeAll(async () => {
    await prisma.client.user.createMany({
      data: [
        {
          id: userAId,
          email: `${userAId}@patient-profile.test`,
          passwordHash: 'integration-only-placeholder',
          firstName: 'Asha',
          lastName: 'Rao',
          preferredLanguage: 'en',
          status: 'ACTIVE',
        },
        {
          id: userBId,
          email: `${userBId}@patient-profile.test`,
          passwordHash: 'integration-only-placeholder',
          firstName: 'Bala',
          lastName: 'Krishnan',
          preferredLanguage: 'en',
          status: 'ACTIVE',
        },
      ],
    });
  });

  afterAll(async () => {
    // AuditEvent is append-only (DB-enforced) and User rows created here are
    // referenced by platformActorUserId with onDelete: Restrict, so neither
    // the audit trail nor these test users can be deleted afterward. This
    // matches the established convention in
    // authorization-audit.integration.spec.ts: disconnect only, no teardown
    // deletes against audit-linked rows.
    await prisma.client.$disconnect();
  });

  it('reads only the authenticated global identity', async () => {
    const profile = await service.getOwnProfile(identity(userAId));

    expect(profile.userId).toBe(userAId);
    expect(profile.firstName).toBe('Asha');
    expect(profile.lastName).toBe('Rao');
    expect(profile.email).toBe(`${userAId}@patient-profile.test`);
  });

  it('updates only the authenticated identity and persists the audit record atomically', async () => {
    const updated = await service.updateOwnProfile(identity(userAId), {
      firstName: 'Asha Updated',
      preferredLanguage: 'ta',
      wantsReservationNotifications: true,
      hideSensitiveNotifications: false,
    });

    expect(updated).toEqual(
      expect.objectContaining({
        userId: userAId,
        firstName: 'Asha Updated',
        preferredLanguage: 'ta',
        wantsReservationNotifications: true,
        hideSensitiveNotifications: false,
      }),
    );

    const untouchedUser = await prisma.client.user.findUniqueOrThrow({
      where: { id: userBId },
      select: {
        firstName: true,
        lastName: true,
        preferredLanguage: true,
      },
    });

    expect(untouchedUser).toEqual({
      firstName: 'Bala',
      lastName: 'Krishnan',
      preferredLanguage: 'en',
    });

    const evidence = await prisma.client.auditEvent.findMany({
      where: {
        platformActorUserId: userAId,
        eventType: 'patient.profile.updated',
      },
      orderBy: {
        occurredAt: 'desc',
      },
    });

    expect(evidence).toHaveLength(1);
    expect(evidence[0]).toEqual(
      expect.objectContaining({
        scope: 'PLATFORM',
        actorType: 'PLATFORM_USER',
        outcome: 'SUCCEEDED',
        platformActorUserId: userAId,
        eventType: 'patient.profile.updated',
      }),
    );

    expect(evidence[0]?.tenantId).toBeNull();
    expect(evidence[0]?.actorMembershipId).toBeNull();

    expect(evidence[0]?.metadata).toEqual({
      fieldsChanged:
        'firstName,hideSensitiveNotifications,preferredLanguage,wantsReservationNotifications',
    });
  });

  it('returns no other patient when the authenticated user id does not exist', async () => {
    await expect(service.getOwnProfile(identity(randomUUID()))).rejects.toMatchObject({
      status: 404,
    });
  });

  it('rolls back the profile mutation when PostgreSQL rejects the audit write', async () => {
    const before = await prisma.client.user.findUniqueOrThrow({
      where: { id: userAId },
      select: { lastName: true },
    });

    const constraintFailingAudit = {
      async appendPlatformUser(
        database: Prisma.TransactionClient,
        input: { platformActorUserId: string },
      ): Promise<void> {
        await database.auditEvent.create({
          data: {
            scope: 'PLATFORM',
            actorType: 'PLATFORM_USER',
            outcome: 'SUCCEEDED',
            platformActorUserId: input.platformActorUserId,
            metadata: {},

            // Deliberately outside the migration-backed allowlist.
            // PostgreSQL itself must reject this CHECK constraint.
            eventType: 'patient.profile.integration-forced-invalid',
          },
        });
      },
    } as unknown as AuditWriter;

    const failingService = new PatientProfileService(prisma, constraintFailingAudit);

    await expect(
      failingService.updateOwnProfile(identity(userAId), {
        lastName: 'Should Roll Back',
      }),
    ).rejects.toBeTruthy();

    const after = await prisma.client.user.findUniqueOrThrow({
      where: { id: userAId },
      select: { lastName: true },
    });

    expect(after.lastName).toBe(before.lastName);
    expect(after.lastName).not.toBe('Should Roll Back');
  });
});
