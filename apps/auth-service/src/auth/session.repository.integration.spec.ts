import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { SessionRepository } from './session.repository';
import { isInfrastructureTestEnabled, requireEnv } from './testing/infrastructure-test-gate';
import { AuditWriter } from '../audit/audit-writer.service';

const describeSessionInfra = isInfrastructureTestEnabled() ? describe : describe.skip;

if (isInfrastructureTestEnabled()) {
  requireEnv('DATABASE_URL');
}

describeSessionInfra('SessionRepository PostgreSQL security integration', () => {
  const prisma = new PrismaService();
  const repository = new SessionRepository(prisma, new AuditWriter());
  const tenantId = randomUUID();
  const otherTenantId = randomUUID();
  const userId = randomUUID();
  const membershipId = randomUUID();
  const metadata = { ipAddress: '127.0.0.1', userAgent: 'Jest integration' };

  beforeAll(async () => {
    await prisma.client.tenant.createMany({
      data: [
        { id: tenantId, name: 'Auth Integration', slug: `auth-${tenantId}` },
        { id: otherTenantId, name: 'Other Integration', slug: `auth-${otherTenantId}` },
      ],
    });
    await prisma.client.user.create({
      data: {
        id: userId,
        email: `${userId}@medsphere.test`,
        passwordHash: 'integration-only-placeholder',
        firstName: 'Auth',
        lastName: 'Integration',
      },
    });
    await prisma.client.tenantMembership.create({
      data: {
        id: membershipId,
        tenantId,
        userId,
        status: 'ACTIVE',
        joinedAt: new Date(),
      },
    });
  });

  beforeEach(async () => {
    await prisma.client.userSession.deleteMany({ where: { membershipId } });
  });

  afterAll(async () => {
    await prisma.client.$disconnect();
  });

  it('accepts only the exact active user-membership-tenant-session chain', async () => {
    const sessionId = randomUUID();
    await createActiveSession(sessionId, randomUUID(), 'a'.repeat(64));

    await expect(
      repository.validateAccessIdentity(
        { userId, membershipId, tenantId, sessionId },
        randomUUID(),
      ),
    ).resolves.toMatchObject({ userId, membershipId, tenantId, sessionId });

    await expect(
      repository.validateAccessIdentity(
        { userId, membershipId, tenantId: otherTenantId, sessionId },
        randomUUID(),
      ),
    ).resolves.toBeNull();
  });

  it('rotates once, preserves absolute expiry, and revokes the family on replay', async () => {
    const sessionId = randomUUID();
    const familyId = randomUUID();
    const nextSessionId = randomUUID();
    const absoluteExpiresAt = await createActiveSession(sessionId, familyId, 'a'.repeat(64));

    const rotated = await repository.rotateSession({
      currentSessionId: sessionId,
      presentedHash: 'a'.repeat(64),
      nextSessionId,
      nextRefreshTokenHash: 'b'.repeat(64),
      idleTtlSeconds: 3600,
      metadata,
    });
    expect(rotated).toMatchObject({ status: 'ROTATED', identity: { sessionId: nextSessionId } });
    if (rotated.status === 'ROTATED') {
      expect(rotated.absoluteExpiresAt).toEqual(absoluteExpiresAt);
    }

    await expect(
      repository.rotateSession({
        currentSessionId: sessionId,
        presentedHash: 'a'.repeat(64),
        nextSessionId: randomUUID(),
        nextRefreshTokenHash: 'c'.repeat(64),
        idleTtlSeconds: 3600,
        metadata,
      }),
    ).resolves.toEqual({ status: 'REPLAY_DETECTED' });

    const family = await prisma.client.userSession.findMany({
      where: { familyId },
      select: { status: true },
    });
    expect(family).toHaveLength(2);
    expect(family.every((session) => session.status === 'COMPROMISED')).toBe(true);
  });

  it('serializes concurrent refresh and detects the losing credential use', async () => {
    const sessionId = randomUUID();
    const familyId = randomUUID();
    await createActiveSession(sessionId, familyId, 'd'.repeat(64));

    const attempts = await Promise.all([
      repository.rotateSession({
        currentSessionId: sessionId,
        presentedHash: 'd'.repeat(64),
        nextSessionId: randomUUID(),
        nextRefreshTokenHash: 'e'.repeat(64),
        idleTtlSeconds: 3600,
        metadata,
      }),
      repository.rotateSession({
        currentSessionId: sessionId,
        presentedHash: 'd'.repeat(64),
        nextSessionId: randomUUID(),
        nextRefreshTokenHash: 'f'.repeat(64),
        idleTtlSeconds: 3600,
        metadata,
      }),
    ]);

    expect(attempts.map((result) => result.status).sort()).toEqual(['REPLAY_DETECTED', 'ROTATED']);
    const activeCount = await prisma.client.userSession.count({
      where: { familyId, status: 'ACTIVE' },
    });
    expect(activeCount).toBe(0);
  });

  it('writes session creation evidence atomically and rolls back when audit persistence fails', async () => {
    const acceptedSessionId = randomUUID();
    await createActiveSession(acceptedSessionId, randomUUID(), '1'.repeat(64));

    await expect(
      prisma.client.auditEvent.count({
        where: {
          tenantId,
          actorMembershipId: membershipId,
          eventType: 'authentication.session.created',
          resourceId: acceptedSessionId,
        },
      }),
    ).resolves.toBe(1);

    const rejectedSessionId = randomUUID();
    await expect(
      repository.createSession({
        id: rejectedSessionId,
        membershipId,
        tenantId,
        familyId: randomUUID(),
        refreshTokenHash: '2'.repeat(64),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        absoluteExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        metadata: { ipAddress: 'not-an-ip-address' },
      }),
    ).rejects.toBeDefined();
    await expect(
      prisma.client.userSession.findUnique({ where: { id: rejectedSessionId } }),
    ).resolves.toBeNull();
  });

  it('records logout-all as platform evidence rather than a tenant aggregate', async () => {
    const sessionId = randomUUID();
    await createActiveSession(sessionId, randomUUID(), '3'.repeat(64));
    const identity = {
      userId,
      membershipId,
      tenantId,
      sessionId,
      tokenId: randomUUID(),
    };

    await repository.revokeAllForUser(identity, metadata);

    const event = await prisma.client.auditEvent.findFirstOrThrow({
      where: {
        platformActorUserId: userId,
        eventType: 'authentication.sessions.logout.succeeded',
        resourceId: userId,
      },
      orderBy: { occurredAt: 'desc' },
    });
    expect(event).toMatchObject({
      scope: 'PLATFORM',
      actorType: 'PLATFORM_USER',
      tenantId: null,
      actorMembershipId: null,
    });
  });

  async function createActiveSession(
    id: string,
    familyId: string,
    refreshTokenHash: string,
  ): Promise<Date> {
    const absoluteExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await repository.createSession({
      id,
      membershipId,
      tenantId,
      familyId,
      refreshTokenHash,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      absoluteExpiresAt,
      metadata,
    });
    return absoluteExpiresAt;
  }
});
