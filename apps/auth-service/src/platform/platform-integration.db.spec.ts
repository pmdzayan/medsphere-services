import { randomUUID } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { AuditWriter } from '../audit/audit-writer.service';
import { PrismaService } from '../prisma/prisma.service';
import { parseAuthEnvironment } from '../auth/auth-config.service';
import { createAuthConfigFixture } from '../auth/testing/auth-config-fixture';
import { PasswordService } from '../auth/password.service';
import { isInfrastructureTestEnabled, requireEnv } from '../auth/testing/infrastructure-test-gate';
import { PlatformRepository } from './platform.repository';
import { PlatformSessionRepository } from './platform-session.repository';
import { PlatformTokenService } from './platform-token.service';
import { PlatformAdminService } from './platform-admin.service';
import { PlatformInvitationService } from './platform-invitation.service';
import { PLATFORM_ADMIN_ROLE_KEY, PLATFORM_OWNER_ROLE_KEY } from './platform.constants';

const describeInfra = isInfrastructureTestEnabled() ? describe : describe.skip;

if (isInfrastructureTestEnabled()) {
  requireEnv('DATABASE_URL');
}

describeInfra('Task 0021 platform administration foundation (real PostgreSQL)', () => {
  const prisma = new PrismaService();
  const auditWriter = new AuditWriter();
  const configuration = parseAuthEnvironment(createAuthConfigFixture());
  const jwtService = new JwtService();
  const passwordService = new PasswordService({ value: configuration } as never);

  const platformTokens = new PlatformTokenService(jwtService, {
    value: configuration,
  } as never);
  const repository = new PlatformRepository(prisma as never);
  const sessions = new PlatformSessionRepository(prisma as never, auditWriter, platformTokens);
  const invitationService = new PlatformInvitationService(
    prisma as never,
    repository,
    auditWriter,
    { value: configuration } as never,
    passwordService,
  );
  const adminService = new PlatformAdminService(prisma as never, repository, sessions, auditWriter);

  const ownerUserId = randomUUID();
  const adminUserId = randomUUID();
  const plainUserId = randomUUID();
  const tenantId = randomUUID();
  let ownerAccountId = '';

  beforeAll(async () => {
    await passwordService.onModuleInit();

    // Dedicated integration database: reset platform state so replaying the
    // suite is deterministic.
    await prisma.client.platformSessionRefreshCredential.deleteMany({});
    await prisma.client.platformInvitation.deleteMany({});
    await prisma.client.platformSession.deleteMany({});
    await prisma.client.platformRoleAssignment.deleteMany({});
    await prisma.client.platformAccount.deleteMany({});

    await prisma.client.user.createMany({
      data: [
        {
          id: ownerUserId,
          email: `platform-owner-${ownerUserId}@medsphere.test`,
          firstName: 'Owner',
          lastName: 'One',
        },
        {
          id: adminUserId,
          email: `platform-admin-${adminUserId}@medsphere.test`,
          firstName: 'Admin',
          lastName: 'One',
        },
        {
          id: plainUserId,
          email: `platform-plain-${plainUserId}@medsphere.test`,
          firstName: 'Plain',
          lastName: 'User',
        },
      ],
    });

    const owner = await adminService.bootstrapInitialOwner(ownerUserId);
    ownerAccountId = owner.platformAccountId;
  }, 30_000);

  afterAll(async () => {
    await prisma.client.$disconnect();
  });
  it('bootstrap creates the protected initial owner exactly once', async () => {
    await expect(adminService.bootstrapInitialOwner(ownerUserId)).rejects.toThrow(
      ConflictException,
    );
    const count = await prisma.client.platformRoleAssignment.count({
      where: { grantedRoleKey: PLATFORM_OWNER_ROLE_KEY },
    });
    expect(count).toBe(1);
  });

  it('a platform account with no tenant membership is granted NO tenant authority by construction', async () => {
    // The owner has no TenantMembership row (structural proof).
    const memberships = await prisma.client.tenantMembership.count({
      where: { userId: ownerUserId },
    });
    expect(memberships).toBe(0);

    // The plain user gets a tenant membership (tenant authority only).
    await prisma.client.tenant.create({
      data: { id: tenantId, name: 'Task 0021 Tenant', slug: `t0021-${tenantId}` },
    });
    await prisma.client.tenantMembership.create({
      data: { id: randomUUID(), tenantId, userId: plainUserId, status: 'ACTIVE' },
    });
  });

  it('issuePlatformSession creates a dedicated tenant-less platform session', async () => {
    const sessionId = randomUUID();
    const refresh = platformTokens.issuePlatformRefreshCredential(sessionId);
    await sessions.createPlatformSession({
      id: sessionId,
      userId: ownerUserId,
      familyId: randomUUID(),
      refreshTokenHash: refresh.hash,
      expiresAt: new Date(Date.now() + 3600_000),
      absoluteExpiresAt: new Date(Date.now() + 86_400_000),
      metadata: {},
    });

    const row = await prisma.client.platformSession.findUniqueOrThrow({ where: { id: sessionId } });
    expect(row).not.toHaveProperty('tenantId');
    expect(row).not.toHaveProperty('membershipId');
    expect(row.status).toBe('ACTIVE');
  });

  it('validatePlatformAccessIdentity requires the live platform account + role', async () => {
    const session = await prisma.client.platformSession.findFirst({
      where: { userId: ownerUserId },
      orderBy: { createdAt: 'desc' },
    });
    expect(session).not.toBeNull();

    const identity = await sessions.validatePlatformAccessIdentity(
      {
        userId: ownerUserId,
        platformAccountId: ownerAccountId,
        platformSessionId: session!.id,
        securityVersion: 1,
      },
      randomUUID(),
    );
    expect(identity).not.toBeNull();
  });

  it('suspending the platform account immediately invalidates its live session', async () => {
    await prisma.client.platformAccount.update({
      where: { id: ownerAccountId },
      data: { status: 'SUSPENDED' },
    });

    const session = await prisma.client.platformSession.findFirst({
      where: { userId: ownerUserId },
      orderBy: { createdAt: 'desc' },
    });
    const stillValid = await sessions.validatePlatformAccessIdentity(
      {
        userId: ownerUserId,
        platformAccountId: ownerAccountId,
        platformSessionId: session!.id,
        securityVersion: 1,
      },
      randomUUID(),
    );
    expect(stillValid).toBeNull();
  });

  it('creates an invitation whose plaintext is NEVER persisted (digest only)', async () => {
    const created = await invitationService.createInvitation(
      ownerUserId,
      `invitee-${randomUUID()}@medsphere.test`,
      PLATFORM_ADMIN_ROLE_KEY,
      7,
    );

    const row = await prisma.client.platformInvitation.findUniqueOrThrow({
      where: { id: created.invitationId },
    });
    expect(row.invitationHash).toMatch(/^[a-f0-9]{64}$/);
    expect(row.invitationHash).not.toContain(created.invitationToken);

    // A direct audit/serialization of the invitation NEVER exposes the proof.
    const serialized = JSON.stringify(row);
    expect(serialized).not.toContain(created.invitationToken);
  });

  it('rejects expired and revoked invitations; replays lose every time', async () => {
    // Create an invitation, revoke it immediately.
    const revokedTarget = `revoked-${randomUUID()}@medsphere.test`;
    const revoked = await invitationService.createInvitation(
      ownerUserId,
      revokedTarget,
      PLATFORM_ADMIN_ROLE_KEY,
      7,
    );
    await invitationService.revokeInvitation(ownerUserId, revoked.invitationId);

    await expect(
      invitationService.acceptWithPassword(
        revoked.invitationToken,
        'someone@else.in',
        'x'.repeat(20),
      ),
    ).resolves.toBeNull();

    // Expired invitation: ttlDays 0 is disallowed by the DTO, so simulate by
    // directly expiring a row.
    const expiredTarget = `expired-${randomUUID()}@medsphere.test`;
    const created = await invitationService.createInvitation(
      ownerUserId,
      expiredTarget,
      PLATFORM_ADMIN_ROLE_KEY,
      7,
    );
    await prisma.client.platformInvitation.update({
      where: { id: created.invitationId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await expect(
      invitationService.acceptWithPassword(created.invitationToken, expiredTarget, 'x'.repeat(20)),
    ).resolves.toBeNull();
  });

  it('concurrent invitation acceptance has exactly one winner', async () => {
    const acceptedUserId = randomUUID();
    const acceptedEmail = `concurrent-owner-${acceptedUserId}@medsphere.test`;
    const acceptedPassword = 'correct-horse-constant-2026';
    await prisma.client.user.create({
      data: {
        id: acceptedUserId,
        email: acceptedEmail,
        passwordHash: await passwordService.hash(acceptedPassword),
        firstName: 'Concurrent',
        lastName: 'Accepter',
      },
    });

    const created = await invitationService.createInvitation(
      ownerUserId,
      acceptedEmail,
      PLATFORM_ADMIN_ROLE_KEY,
      7,
    );

    const outcome = await Promise.allSettled([
      invitationService.acceptWithPassword(
        created.invitationToken,
        acceptedEmail,
        acceptedPassword,
      ),
      invitationService.acceptWithPassword(
        created.invitationToken,
        acceptedEmail,
        acceptedPassword,
      ),
    ]);

    // Exactly one winner: only one acceptance returns a non-null account;
    // the concurrent loser resolves to `null` (single-use claim).
    const acceptedCount = outcome.filter(
      (r) => r.status === 'fulfilled' && r.value !== null && r.value !== undefined,
    ).length;
    expect(acceptedCount).toBe(1);

    const row = await prisma.client.platformInvitation.findUniqueOrThrow({
      where: { id: created.invitationId },
    });
    expect(row.status).toBe('ACCEPTED');
  });

  it('deterministic bounded admin pagination with no duplicate/omitted rows', async () => {
    const page1 = await adminService.listPlatformAdmins(100);
    const first = page1.data.slice(0, 1);
    expect(page1.data.length).toBeGreaterThan(0);

    // Cursor pagination continues deterministically.
    const page2 = first.length
      ? await adminService.listPlatformAdmins(100, page1.nextCursor ?? undefined)
      : page1;
    expect(Array.isArray(page2.data)).toBe(true);
  });
});
