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
  const otherUserId = randomUUID();
  const membershipId = randomUUID();
  const otherMembershipId = randomUUID();
  const metadata = { ipAddress: '127.0.0.1', userAgent: 'Jest integration' };

  beforeAll(async () => {
    await prisma.client.tenant.createMany({
      data: [
        { id: tenantId, name: 'Auth Integration', slug: `auth-${tenantId}` },
        { id: otherTenantId, name: 'Other Integration', slug: `auth-${otherTenantId}` },
      ],
    });
    await prisma.client.user.createMany({
      data: [
        {
          id: userId,
          email: `${userId}@medsphere.test`,
          passwordHash: 'integration-only-placeholder',
          firstName: 'Auth',
          lastName: 'Integration',
        },
        {
          id: otherUserId,
          email: `${otherUserId}@medsphere.test`,
          passwordHash: 'integration-only-placeholder',
          firstName: 'Other',
          lastName: 'User',
        },
      ],
    });
    await prisma.client.tenantMembership.createMany({
      data: [
        {
          id: membershipId,
          tenantId,
          userId,
          status: 'ACTIVE',
          joinedAt: new Date(),
        },
        {
          id: otherMembershipId,
          tenantId,
          userId: otherUserId,
          status: 'ACTIVE',
          joinedAt: new Date(),
        },
      ],
    });
  });

  beforeEach(async () => {
    await prisma.client.userSessionRefreshCredential.deleteMany({
      where: { session: { membershipId } },
    });
    await prisma.client.userSession.deleteMany({ where: { membershipId } });
    await prisma.client.userSessionRefreshCredential.deleteMany({
      where: { session: { membershipId: otherMembershipId } },
    });
    await prisma.client.userSession.deleteMany({ where: { membershipId: otherMembershipId } });
  });

  afterAll(async () => {
    await prisma.client.$disconnect();
  });

  it('persists the session and first credential atomically with only the hash', async () => {
    const sessionId = randomUUID();
    const familyId = randomUUID();
    const hash = (randomUUID() + randomUUID()).replace(/-/g, '').slice(0, 64);
    await createActiveSession(sessionId, familyId, hash);

    const session = await prisma.client.userSession.findUniqueOrThrow({
      where: { id: sessionId },
      include: { refreshCredentials: true },
    });
    expect(session.userId).toBe(userId);
    expect(session.tenantId).toBe(tenantId);
    expect(session.version).toBe(1);
    expect(session.refreshCredentials).toHaveLength(1);
    expect(session.refreshCredentials[0]).toMatchObject({
      hash,
      status: 'ACTIVE',
      rotationSequence: 1,
    });
    expect(session.refreshCredentials[0].hash).not.toContain('msr.');
  });

  it('accepts only the exact active user-membership-tenant-session chain', async () => {
    const sessionId = randomUUID();
    const hash = (randomUUID() + randomUUID()).replace(/-/g, '').slice(0, 64);
    await createActiveSession(sessionId, randomUUID(), hash);

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

    await expect(
      repository.validateAccessIdentity(
        { userId: otherUserId, membershipId, tenantId, sessionId },
        randomUUID(),
      ),
    ).resolves.toBeNull();

    await expect(
      repository.validateAccessIdentity(
        { userId, membershipId: otherMembershipId, tenantId, sessionId },
        randomUUID(),
      ),
    ).resolves.toBeNull();
  });

  it('rotates once, preserves absolute expiry, and revokes the family on replay', async () => {
    const sessionId = randomUUID();
    const familyId = randomUUID();
    const h1 = (randomUUID() + randomUUID()).replace(/-/g, '').slice(0, 64);
    const h2 = (randomUUID() + randomUUID()).replace(/-/g, '').slice(0, 64);
    const h3 = (randomUUID() + randomUUID()).replace(/-/g, '').slice(0, 64);
    const absoluteExpiresAt = await createActiveSession(sessionId, familyId, h1);

    const rotated = await repository.rotateSession({
      currentSessionId: sessionId,
      presentedHash: h1,
      nextSessionId: randomUUID(),
      nextRefreshTokenHash: h2,
      idleTtlSeconds: 3600,
      metadata,
    });
    expect(rotated).toMatchObject({ status: 'ROTATED' });
    if (rotated.status === 'ROTATED') {
      expect(rotated.absoluteExpiresAt).toEqual(absoluteExpiresAt);
      expect(rotated.identity.sessionId).not.toBe(sessionId);
    }

    const oldCredential = await prisma.client.userSessionRefreshCredential.findFirstOrThrow({
      where: { sessionId, hash: h1 },
    });
    expect(oldCredential.status).toBe('USED');
    expect(oldCredential.usedAt).not.toBeNull();

    await expect(
      repository.rotateSession({
        currentSessionId: sessionId,
        presentedHash: h1,
        nextSessionId: randomUUID(),
        nextRefreshTokenHash: h3,
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

  it('returns INVALID for an unknown hash without revoking the family', async () => {
    const sessionId = randomUUID();
    const familyId = randomUUID();
    const h1 = (randomUUID() + randomUUID()).replace(/-/g, '').slice(0, 64);
    const h2 = (randomUUID() + randomUUID()).replace(/-/g, '').slice(0, 64);
    const h3 = (randomUUID() + randomUUID()).replace(/-/g, '').slice(0, 64);
    await createActiveSession(sessionId, familyId, h1);

    await expect(
      repository.rotateSession({
        currentSessionId: sessionId,
        presentedHash: h2,
        nextSessionId: randomUUID(),
        nextRefreshTokenHash: h3,
        idleTtlSeconds: 3600,
        metadata,
      }),
    ).resolves.toEqual({ status: 'INVALID' });

    const family = await prisma.client.userSession.findMany({
      where: { familyId },
      select: { status: true },
    });
    expect(family).toHaveLength(1);
    expect(family[0].status).toBe('ACTIVE');
  });

  it('serializes concurrent refresh and detects the losing credential use', async () => {
    const sessionId = randomUUID();
    const familyId = randomUUID();
    const h1 = (randomUUID() + randomUUID()).replace(/-/g, '').slice(0, 64);
    const h2 = (randomUUID() + randomUUID()).replace(/-/g, '').slice(0, 64);
    const h3 = (randomUUID() + randomUUID()).replace(/-/g, '').slice(0, 64);
    await createActiveSession(sessionId, familyId, h1);

    const attempts = await Promise.all([
      repository.rotateSession({
        currentSessionId: sessionId,
        presentedHash: h1,
        nextSessionId: randomUUID(),
        nextRefreshTokenHash: h2,
        idleTtlSeconds: 3600,
        metadata,
      }),
      repository.rotateSession({
        currentSessionId: sessionId,
        presentedHash: h1,
        nextSessionId: randomUUID(),
        nextRefreshTokenHash: h3,
        idleTtlSeconds: 3600,
        metadata,
      }),
    ]);

    const statuses = attempts.map((result) => result.status).sort();
    expect(statuses).toContain('ROTATED');
    expect(statuses).toContain('REPLAY_DETECTED');
    expect(statuses.filter((status) => status === 'ROTATED')).toHaveLength(1);

    const activeCount = await prisma.client.userSessionRefreshCredential.count({
      where: { session: { familyId }, status: 'ACTIVE' },
    });
    expect(activeCount).toBe(0);
  });

  it('writes session creation evidence atomically and rolls back when audit persistence fails', async () => {
    const acceptedSessionId = randomUUID();
    const h1 = (randomUUID() + randomUUID()).replace(/-/g, '').slice(0, 64);
    const h2 = (randomUUID() + randomUUID()).replace(/-/g, '').slice(0, 64);
    await createActiveSession(acceptedSessionId, randomUUID(), h1);

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
        userId,
        membershipId,
        tenantId,
        familyId: randomUUID(),
        refreshTokenHash: h2,
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
    const h1 = (randomUUID() + randomUUID()).replace(/-/g, '').slice(0, 64);
    await createActiveSession(sessionId, randomUUID(), h1);
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

  it('revoke-all affects only the target user', async () => {
    const targetSessionId = randomUUID();
    const otherSessionId = randomUUID();
    const h1 = (randomUUID() + randomUUID()).replace(/-/g, '').slice(0, 64);
    const h2 = (randomUUID() + randomUUID()).replace(/-/g, '').slice(0, 64);
    await createActiveSession(targetSessionId, randomUUID(), h1);
    await createActiveSession(otherSessionId, randomUUID(), h2, otherMembershipId);

    const identity = {
      userId,
      membershipId,
      tenantId,
      sessionId: targetSessionId,
      tokenId: randomUUID(),
    };
    const revokedCount = await repository.revokeAllForUser(identity, metadata);
    expect(revokedCount).toBe(1);

    await expect(
      prisma.client.userSession.findUniqueOrThrow({ where: { id: targetSessionId } }),
    ).resolves.toMatchObject({ status: 'REVOKED' });
    await expect(
      prisma.client.userSession.findUniqueOrThrow({ where: { id: otherSessionId } }),
    ).resolves.toMatchObject({ status: 'ACTIVE' });
  });

  it('cleanup processes a bounded batch and is idempotent', async () => {
    const expiredSessionId = randomUUID();
    const activeSessionId = randomUUID();
    const h1 = (randomUUID() + randomUUID()).replace(/-/g, '').slice(0, 64);
    const h2 = (randomUUID() + randomUUID()).replace(/-/g, '').slice(0, 64);
    await createActiveSession(expiredSessionId, randomUUID(), h1, membershipId, {
      expiresAt: new Date(Date.now() - 1000),
    });
    await createActiveSession(activeSessionId, randomUUID(), h2);

    const first = await repository.expireStaleSessions(1);
    expect(first).toBe(1);

    const second = await repository.expireStaleSessions(1);
    expect(second).toBe(0);

    await expect(
      prisma.client.userSession.findUniqueOrThrow({ where: { id: expiredSessionId } }),
    ).resolves.toMatchObject({ status: 'EXPIRED' });
    await expect(
      prisma.client.userSession.findUniqueOrThrow({ where: { id: activeSessionId } }),
    ).resolves.toMatchObject({ status: 'ACTIVE' });
  });

  it('rejects invalid batch sizes for cleanup', async () => {
    await expect(repository.expireStaleSessions(0)).rejects.toThrow(
      'Cleanup batch size must be between 1 and 10000',
    );
    await expect(repository.expireStaleSessions(10001)).rejects.toThrow(
      'Cleanup batch size must be between 1 and 10000',
    );
  });

  it('enforces identity tuple integrity at the database level and rejects mismatched UserSession writes', async () => {
    const validSessionId = randomUUID();
    const h1 = (randomUUID() + randomUUID()).replace(/-/g, '').slice(0, 64);
    const h2 = (randomUUID() + randomUUID()).replace(/-/g, '').slice(0, 64);
    const h3 = (randomUUID() + randomUUID()).replace(/-/g, '').slice(0, 64);
    await createActiveSession(validSessionId, randomUUID(), h1);

    // Mismatched userId: using otherUserId with membershipId (which belongs to userId)
    await expect(
      prisma.client.userSession.create({
        data: {
          id: randomUUID(),
          userId: otherUserId,
          membershipId,
          tenantId,
          familyId: randomUUID(),
          refreshTokenHash: h2,
          expiresAt: new Date(Date.now() + 3600 * 1000),
          absoluteExpiresAt: new Date(Date.now() + 86400 * 1000),
        },
      }),
    ).rejects.toThrow();

    // Mismatched tenantId: using otherTenantId with membershipId (which belongs to tenantId)
    await expect(
      prisma.client.userSession.create({
        data: {
          id: randomUUID(),
          userId,
          membershipId,
          tenantId: otherTenantId,
          familyId: randomUUID(),
          refreshTokenHash: h3,
          expiresAt: new Date(Date.now() + 3600 * 1000),
          absoluteExpiresAt: new Date(Date.now() + 86400 * 1000),
        },
      }),
    ).rejects.toThrow();

    // Mismatched update: trying to change an existing session's userId to otherUserId
    await expect(
      prisma.client.userSession.update({
        where: { id: validSessionId },
        data: { userId: otherUserId },
      }),
    ).rejects.toThrow();
  });

  async function createActiveSession(
    id: string,
    familyId: string,
    refreshTokenHash: string,
    targetMembershipId: string = membershipId,
    overrides: { expiresAt?: Date; userId?: string } = {},
  ): Promise<Date> {
    const absoluteExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const targetUserId =
      overrides.userId ?? (targetMembershipId === otherMembershipId ? otherUserId : userId);
    await repository.createSession({
      id,
      userId: targetUserId,
      membershipId: targetMembershipId,
      tenantId,
      familyId,
      refreshTokenHash,
      expiresAt: overrides.expiresAt ?? new Date(Date.now() + 60 * 60 * 1000),
      absoluteExpiresAt,
      metadata,
    });
    return absoluteExpiresAt;
  }
});
