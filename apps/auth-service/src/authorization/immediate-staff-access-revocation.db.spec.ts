import { randomUUID } from 'node:crypto';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AuditWriter } from '../audit/audit-writer.service';
import { AuthenticatedIdentity, AccessTokenIdentity } from '../auth/auth.types';
import { isInfrastructureTestEnabled, requireEnv } from '../auth/testing/infrastructure-test-gate';
import { SessionRepository } from '../auth/session.repository';
import { PrismaService } from '../prisma/prisma.service';
import { AuthorizationRepository } from './authorization.repository';
import { AuthorizationService } from './authorization.service';
import { PERMISSIONS, TENANT_ADMINISTRATOR_ROLE } from './permission.constants';

const infrastructure = isInfrastructureTestEnabled() ? describe : describe.skip;
if (isInfrastructureTestEnabled()) requireEnv('DATABASE_URL');

infrastructure('Task 0018 Immediate Staff Access Revocation (DB Integration)', () => {
  const prisma = new PrismaService();
  const auditWriter = new AuditWriter();
  const authorizationRepository = new AuthorizationRepository(prisma);
  const authorizationService = new AuthorizationService(authorizationRepository, auditWriter);
  const sessionRepository = new SessionRepository(prisma, auditWriter);

  const tenantAId = randomUUID();
  const tenantBId = randomUUID();
  const userId = randomUUID();
  const secondAdminUserId = randomUUID();

  const membershipAId = randomUUID();
  const membershipBId = randomUUID();
  const adminMembershipAId = randomUUID();

  const adminRoleAId = randomUUID();
  const staffRoleAId = randomUUID();

  const adminIdentity: AuthenticatedIdentity = {
    tenantId: tenantAId,
    userId: secondAdminUserId,
    membershipId: adminMembershipAId,
    sessionId: randomUUID(),
    tokenId: randomUUID(),
    securityVersion: 1,
  };

  beforeAll(async () => {
    // Set up tenants
    await prisma.client.tenant.createMany({
      data: [
        { id: tenantAId, name: 'Task 0018 Pharmacy A', slug: `task0018-pharma-${tenantAId}` },
        { id: tenantBId, name: 'Task 0018 Hospital B', slug: `task0018-hosp-${tenantBId}` },
      ],
    });

    // Set up users
    await prisma.client.user.createMany({
      data: [
        {
          id: userId,
          email: `staff-${userId}@medsphere.test`,
          passwordHash: 'integration-placeholder-hash',
          firstName: 'MultiTenant',
          lastName: 'Staff',
          status: 'ACTIVE',
        },
        {
          id: secondAdminUserId,
          email: `admin-${secondAdminUserId}@medsphere.test`,
          passwordHash: 'integration-placeholder-hash',
          firstName: 'Admin',
          lastName: 'User',
          status: 'ACTIVE',
        },
      ],
    });

    // Set up memberships
    await prisma.client.tenantMembership.createMany({
      data: [
        {
          id: membershipAId,
          tenantId: tenantAId,
          userId,
          status: 'ACTIVE',
          joinedAt: new Date(),
        },
        {
          id: membershipBId,
          tenantId: tenantBId,
          userId,
          status: 'ACTIVE',
          joinedAt: new Date(),
        },
        {
          id: adminMembershipAId,
          tenantId: tenantAId,
          userId: secondAdminUserId,
          status: 'ACTIVE',
          joinedAt: new Date(),
        },
      ],
    });

    // Set up roles
    await prisma.client.role.createMany({
      data: [
        {
          id: adminRoleAId,
          tenantId: tenantAId,
          name: TENANT_ADMINISTRATOR_ROLE,
          type: 'SYSTEM',
        },
        {
          id: staffRoleAId,
          tenantId: tenantAId,
          name: 'STAFF_ROLE',
          type: 'TENANT',
        },
      ],
    });

    // Set up role permissions for admin
    const managePermission = await prisma.client.permission.findUniqueOrThrow({
      where: { name: PERMISSIONS.membershipsManage },
    });

    await prisma.client.rolePermission.create({
      data: {
        id: randomUUID(),
        tenantId: tenantAId,
        roleId: adminRoleAId,
        permissionId: managePermission.id,
      },
    });

    // Assign roles to memberships
    await prisma.client.membershipRole.createMany({
      data: [
        {
          id: randomUUID(),
          tenantId: tenantAId,
          membershipId: adminMembershipAId,
          roleId: adminRoleAId,
        },
        {
          id: randomUUID(),
          tenantId: tenantAId,
          membershipId: membershipAId,
          roleId: staffRoleAId,
        },
      ],
    });
  });

  afterAll(async () => {
    await prisma.client.$disconnect();
  });

  it('proves active staff can access before revocation and is denied immediately afterward', async () => {
    const testSessionId = randomUUID();
    const refreshHash = `hash-test-1-${randomUUID()}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 3600 * 1000);

    await sessionRepository.createSession({
      id: testSessionId,
      userId,
      membershipId: membershipAId,
      tenantId: tenantAId,
      familyId: randomUUID(),
      refreshTokenHash: refreshHash,
      expiresAt,
      absoluteExpiresAt: expiresAt,
      metadata: { requestId: 'req-active-1' },
    });

    const accessIdentity: AccessTokenIdentity = {
      userId,
      membershipId: membershipAId,
      tenantId: tenantAId,
      sessionId: testSessionId,
      securityVersion: 1,
    };

    // Step 1: Active staff session validates successfully
    const validatedBefore = await sessionRepository.validateAccessIdentity(
      accessIdentity,
      'token-1',
    );
    expect(validatedBefore).not.toBeNull();
    expect(validatedBefore?.sessionId).toBe(testSessionId);

    // Step 2: Administrator revokes membership access
    await authorizationService.updateMembershipStatus(
      adminIdentity,
      membershipAId,
      { status: 'REVOKED' },
      { requestId: 'req-revoke-staff' },
    );

    // Step 3: Same access token immediately denied (fails closed)
    const validatedAfter = await sessionRepository.validateAccessIdentity(
      accessIdentity,
      'token-1',
    );
    expect(validatedAfter).toBeNull();
  });

  it('denies stale refresh credential after revocation and prevents refresh successor creation', async () => {
    const targetUserId = randomUUID();
    const targetMembershipId = randomUUID();
    const sessionId = randomUUID();
    const refreshHash = `hash-stale-refresh-${randomUUID()}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 3600 * 1000);

    await prisma.client.user.create({
      data: {
        id: targetUserId,
        email: `refresh-target-${targetUserId}@medsphere.test`,
        firstName: 'Refresh',
        lastName: 'Target',
        status: 'ACTIVE',
      },
    });

    await prisma.client.tenantMembership.create({
      data: {
        id: targetMembershipId,
        tenantId: tenantAId,
        userId: targetUserId,
        status: 'ACTIVE',
        joinedAt: new Date(),
      },
    });

    await sessionRepository.createSession({
      id: sessionId,
      userId: targetUserId,
      membershipId: targetMembershipId,
      tenantId: tenantAId,
      familyId: randomUUID(),
      refreshTokenHash: refreshHash,
      expiresAt,
      absoluteExpiresAt: expiresAt,
      metadata: { requestId: 'req-create-session' },
    });

    // Revoke membership
    await authorizationService.updateMembershipStatus(
      adminIdentity,
      targetMembershipId,
      { status: 'SUSPENDED' },
      { requestId: 'req-suspend-target' },
    );

    // Attempt rotation with the stale refresh credential after revocation.
    const nextSessionId = randomUUID();
    const nextRefreshTokenHash = `hash-next-${randomUUID()}`;

    const rotationResult = await sessionRepository.rotateSession({
      currentSessionId: sessionId,
      presentedHash: refreshHash,
      nextSessionId,
      nextRefreshTokenHash,
      idleTtlSeconds: 900,
      metadata: { requestId: 'req-stale-rotation' },
    });

    expect(rotationResult.status).toBe('REVOKED');

    // The previously established authority remains revoked in PostgreSQL.
    await expect(
      prisma.client.userSession.findUniqueOrThrow({
        where: { id: sessionId },
      }),
    ).resolves.toMatchObject({
      status: 'REVOKED',
      replacedById: null,
    });

    await expect(
      prisma.client.userSessionRefreshCredential.findUniqueOrThrow({
        where: { hash: refreshHash },
      }),
    ).resolves.toMatchObject({
      status: 'REVOKED',
      replacedById: null,
    });

    // No successor session or refresh credential may be minted from stale authority.
    expect(
      await prisma.client.userSession.findUnique({
        where: { id: nextSessionId },
      }),
    ).toBeNull();

    expect(
      await prisma.client.userSessionRefreshCredential.findUnique({
        where: { hash: nextRefreshTokenHash },
      }),
    ).toBeNull();
  });

  it('invalidates all active sessions for revoked membership across multiple devices', async () => {
    const multiUserId = randomUUID();
    const multiMembershipId = randomUUID();
    const laptopSessionId = randomUUID();
    const mobileSessionId = randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 3600 * 1000);

    await prisma.client.user.create({
      data: {
        id: multiUserId,
        email: `multi-${multiUserId}@medsphere.test`,
        firstName: 'MultiDevice',
        lastName: 'User',
        status: 'ACTIVE',
      },
    });

    await prisma.client.tenantMembership.create({
      data: {
        id: multiMembershipId,
        tenantId: tenantAId,
        userId: multiUserId,
        status: 'ACTIVE',
        joinedAt: new Date(),
      },
    });

    await sessionRepository.createSession({
      id: laptopSessionId,
      userId: multiUserId,
      membershipId: multiMembershipId,
      tenantId: tenantAId,
      familyId: randomUUID(),
      refreshTokenHash: `laptop-hash-${randomUUID()}`,
      expiresAt,
      absoluteExpiresAt: expiresAt,
      metadata: { deviceName: 'Laptop' },
    });

    await sessionRepository.createSession({
      id: mobileSessionId,
      userId: multiUserId,
      membershipId: multiMembershipId,
      tenantId: tenantAId,
      familyId: randomUUID(),
      refreshTokenHash: `mobile-hash-${randomUUID()}`,
      expiresAt,
      absoluteExpiresAt: expiresAt,
      metadata: { deviceName: 'Mobile' },
    });

    // Both sessions active
    const laptopBefore = await sessionRepository.validateAccessIdentity(
      {
        userId: multiUserId,
        membershipId: multiMembershipId,
        tenantId: tenantAId,
        sessionId: laptopSessionId,
        securityVersion: 1,
      },
      'tok-laptop',
    );
    const mobileBefore = await sessionRepository.validateAccessIdentity(
      {
        userId: multiUserId,
        membershipId: multiMembershipId,
        tenantId: tenantAId,
        sessionId: mobileSessionId,
        securityVersion: 1,
      },
      'tok-mobile',
    );
    expect(laptopBefore).not.toBeNull();
    expect(mobileBefore).not.toBeNull();

    // Revoke staff membership
    await authorizationService.updateMembershipStatus(
      adminIdentity,
      multiMembershipId,
      { status: 'REVOKED' },
      { requestId: 'req-revoke-multi' },
    );

    // Both sessions invalidated server-side
    const laptopAfter = await sessionRepository.validateAccessIdentity(
      {
        userId: multiUserId,
        membershipId: multiMembershipId,
        tenantId: tenantAId,
        sessionId: laptopSessionId,
        securityVersion: 1,
      },
      'tok-laptop',
    );
    const mobileAfter = await sessionRepository.validateAccessIdentity(
      {
        userId: multiUserId,
        membershipId: multiMembershipId,
        tenantId: tenantAId,
        sessionId: mobileSessionId,
        securityVersion: 1,
      },
      'tok-mobile',
    );
    expect(laptopAfter).toBeNull();
    expect(mobileAfter).toBeNull();
  });

  it('preserves unrelated organization memberships and personal user account status', async () => {
    // User belongs to Tenant A (membershipAId - already revoked in earlier test) and Tenant B (membershipBId - active)
    const membershipB = await prisma.client.tenantMembership.findUnique({
      where: { id: membershipBId },
    });
    expect(membershipB?.status).toBe('ACTIVE');

    const user = await prisma.client.user.findUnique({
      where: { id: userId },
    });
    expect(user?.status).toBe('ACTIVE');
  });

  it('prevents locked workstation session from unlocking after membership revocation', async () => {
    const lockUserId = randomUUID();
    const lockMembershipId = randomUUID();
    const lockSessionId = randomUUID();
    const lockRefreshHash = `lock-refresh-${randomUUID()}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 3600 * 1000);

    await prisma.client.user.create({
      data: {
        id: lockUserId,
        email: `lock-${lockUserId}@medsphere.test`,
        firstName: 'Lock',
        lastName: 'User',
        status: 'ACTIVE',
      },
    });

    await prisma.client.tenantMembership.create({
      data: {
        id: lockMembershipId,
        tenantId: tenantAId,
        userId: lockUserId,
        status: 'ACTIVE',
        joinedAt: new Date(),
      },
    });

    await sessionRepository.createSession({
      id: lockSessionId,
      userId: lockUserId,
      membershipId: lockMembershipId,
      tenantId: tenantAId,
      familyId: randomUUID(),
      refreshTokenHash: lockRefreshHash,
      expiresAt,
      absoluteExpiresAt: expiresAt,
      metadata: { requestId: 'req-lock-create' },
    });

    // Lock workstation session
    const lockIdentity: AuthenticatedIdentity = {
      tenantId: tenantAId,
      userId: lockUserId,
      membershipId: lockMembershipId,
      sessionId: lockSessionId,
      tokenId: randomUUID(),
      securityVersion: 1,
    };
    await sessionRepository.lockSession(lockIdentity, 'user-initiated-lock');

    // Revoke membership while workstation is locked.
    await authorizationService.updateMembershipStatus(
      adminIdentity,
      lockMembershipId,
      { status: 'REVOKED' },
      { requestId: 'req-revoke-locked' },
    );

    // Revocation is physical server-side state, not merely an unlock/UI denial.
    await expect(
      prisma.client.userSession.findUniqueOrThrow({
        where: { id: lockSessionId },
      }),
    ).resolves.toMatchObject({
      status: 'REVOKED',
      revocationReason: 'membership-revoked',
    });

    await expect(
      prisma.client.userSessionRefreshCredential.findUniqueOrThrow({
        where: { hash: lockRefreshHash },
      }),
    ).resolves.toMatchObject({
      status: 'REVOKED',
    });

    const unlockNextSessionId = randomUUID();
    const unlockNextRefreshHash = `lock-next-${randomUUID()}`;

    // Attempt workstation unlock -> fails closed and cannot restore authority.
    const unlockResult = await sessionRepository.unlockSession({
      currentSessionId: lockSessionId,
      presentedHash: lockRefreshHash,
      nextSessionId: unlockNextSessionId,
      nextRefreshTokenHash: unlockNextRefreshHash,
      unlockMethod: 'PIN',
      idleTtlSeconds: 900,
      metadata: { requestId: 'req-unlock-attempt' },
    });

    expect(unlockResult.status).toBe('INVALID');
    await expect(
      prisma.client.userSession.findUnique({
        where: { id: unlockNextSessionId },
      }),
    ).resolves.toBeNull();
    await expect(
      prisma.client.userSessionRefreshCredential.findUnique({
        where: { hash: unlockNextRefreshHash },
      }),
    ).resolves.toBeNull();
  });

  it('fails closed when refresh rotation races membership revocation', async () => {
    const raceUserId = randomUUID();
    const raceMembershipId = randomUUID();
    const raceSessionId = randomUUID();
    const raceFamilyId = randomUUID();
    const raceRefreshHash = `race-refresh-${randomUUID()}`;
    const nextSessionId = randomUUID();
    const nextRefreshHash = `race-next-${randomUUID()}`;
    const expiresAt = new Date(Date.now() + 3600 * 1000);

    await prisma.client.user.create({
      data: {
        id: raceUserId,
        email: `race-${raceUserId}@medsphere.test`,
        firstName: 'Race',
        lastName: 'Refresh',
        status: 'ACTIVE',
      },
    });

    await prisma.client.tenantMembership.create({
      data: {
        id: raceMembershipId,
        tenantId: tenantAId,
        userId: raceUserId,
        status: 'ACTIVE',
        joinedAt: new Date(),
      },
    });

    await sessionRepository.createSession({
      id: raceSessionId,
      userId: raceUserId,
      membershipId: raceMembershipId,
      tenantId: tenantAId,
      familyId: raceFamilyId,
      refreshTokenHash: raceRefreshHash,
      expiresAt,
      absoluteExpiresAt: expiresAt,
      metadata: { requestId: 'req-race-session-create' },
    });

    const [revocationResult, rotationResult] = await Promise.all([
      authorizationService.updateMembershipStatus(
        adminIdentity,
        raceMembershipId,
        { status: 'REVOKED' },
        { requestId: 'req-race-revoke' },
      ),
      sessionRepository.rotateSession({
        currentSessionId: raceSessionId,
        presentedHash: raceRefreshHash,
        nextSessionId,
        nextRefreshTokenHash: nextRefreshHash,
        idleTtlSeconds: 900,
        metadata: { requestId: 'req-race-refresh' },
      }),
    ]);

    expect(revocationResult.status).toBe('REVOKED');
    expect(['REVOKED', 'ROTATED']).toContain(rotationResult.status);

    await expect(
      prisma.client.tenantMembership.findUniqueOrThrow({
        where: { id: raceMembershipId },
      }),
    ).resolves.toMatchObject({ status: 'REVOKED' });

    // Whatever won the race, no usable session or refresh credential survives it.
    await expect(
      prisma.client.userSession.count({
        where: {
          id: { in: [raceSessionId, nextSessionId] },
          status: 'ACTIVE',
        },
      }),
    ).resolves.toBe(0);

    await expect(
      prisma.client.userSessionRefreshCredential.count({
        where: {
          hash: { in: [raceRefreshHash, nextRefreshHash] },
          status: 'ACTIVE',
        },
      }),
    ).resolves.toBe(0);

    if (rotationResult.status === 'ROTATED') {
      await expect(
        prisma.client.userSession.findUniqueOrThrow({
          where: { id: nextSessionId },
        }),
      ).resolves.toMatchObject({ status: 'REVOKED' });

      await expect(
        prisma.client.userSessionRefreshCredential.findUniqueOrThrow({
          where: { hash: nextRefreshHash },
        }),
      ).resolves.toMatchObject({ status: 'REVOKED' });

      const successorIdentity: AccessTokenIdentity = {
        userId: raceUserId,
        membershipId: raceMembershipId,
        tenantId: tenantAId,
        sessionId: nextSessionId,
        securityVersion: rotationResult.identity.securityVersion,
      };

      await expect(
        sessionRepository.validateAccessIdentity(successorIdentity, 'race-successor-token'),
      ).resolves.toBeNull();
    } else {
      await expect(
        prisma.client.userSession.findUnique({
          where: { id: nextSessionId },
        }),
      ).resolves.toBeNull();
      await expect(
        prisma.client.userSessionRefreshCredential.findUnique({
          where: { hash: nextRefreshHash },
        }),
      ).resolves.toBeNull();
    }
  });

  it('allows only one effective transition for simultaneous duplicate revocations', async () => {
    const duplicateUserId = randomUUID();
    const duplicateMembershipId = randomUUID();

    await prisma.client.user.create({
      data: {
        id: duplicateUserId,
        email: `duplicate-${duplicateUserId}@medsphere.test`,
        firstName: 'Duplicate',
        lastName: 'Revocation',
        status: 'ACTIVE',
      },
    });

    await prisma.client.tenantMembership.create({
      data: {
        id: duplicateMembershipId,
        tenantId: tenantAId,
        userId: duplicateUserId,
        status: 'ACTIVE',
        joinedAt: new Date(),
      },
    });

    const results = await Promise.allSettled([
      authorizationService.updateMembershipStatus(
        adminIdentity,
        duplicateMembershipId,
        { status: 'REVOKED' },
        { requestId: 'req-duplicate-revoke-a' },
      ),
      authorizationService.updateMembershipStatus(
        adminIdentity,
        duplicateMembershipId,
        { status: 'REVOKED' },
        { requestId: 'req-duplicate-revoke-b' },
      ),
    ]);

    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]).toMatchObject({
      reason: expect.any(ConflictException),
    });

    await expect(
      prisma.client.tenantMembership.findUniqueOrThrow({
        where: { id: duplicateMembershipId },
      }),
    ).resolves.toMatchObject({ status: 'REVOKED' });

    await expect(
      prisma.client.auditEvent.count({
        where: {
          tenantId: tenantAId,
          resourceId: duplicateMembershipId,
          eventType: 'authorization.membership.revoked',
          outcome: 'SUCCEEDED',
        },
      }),
    ).resolves.toBe(1);
  });

  it('preserves one active tenant administrator under concurrent cross-revocation', async () => {
    const tenantId = randomUUID();
    const firstUserId = randomUUID();
    const secondUserId = randomUUID();
    const firstMembershipId = randomUUID();
    const secondMembershipId = randomUUID();
    const administratorRoleId = randomUUID();

    await prisma.client.tenant.create({
      data: {
        id: tenantId,
        name: 'Task 0018 Concurrent Admin Tenant',
        slug: `task0018-admin-race-${tenantId}`,
      },
    });

    await prisma.client.user.createMany({
      data: [
        {
          id: firstUserId,
          email: `admin-race-a-${firstUserId}@medsphere.test`,
          firstName: 'Admin',
          lastName: 'One',
          status: 'ACTIVE',
        },
        {
          id: secondUserId,
          email: `admin-race-b-${secondUserId}@medsphere.test`,
          firstName: 'Admin',
          lastName: 'Two',
          status: 'ACTIVE',
        },
      ],
    });

    await prisma.client.tenantMembership.createMany({
      data: [
        {
          id: firstMembershipId,
          tenantId,
          userId: firstUserId,
          status: 'ACTIVE',
          joinedAt: new Date(),
        },
        {
          id: secondMembershipId,
          tenantId,
          userId: secondUserId,
          status: 'ACTIVE',
          joinedAt: new Date(),
        },
      ],
    });

    await prisma.client.role.create({
      data: {
        id: administratorRoleId,
        tenantId,
        name: TENANT_ADMINISTRATOR_ROLE,
        type: 'SYSTEM',
      },
    });

    await prisma.client.membershipRole.createMany({
      data: [
        {
          id: randomUUID(),
          tenantId,
          membershipId: firstMembershipId,
          roleId: administratorRoleId,
        },
        {
          id: randomUUID(),
          tenantId,
          membershipId: secondMembershipId,
          roleId: administratorRoleId,
        },
      ],
    });

    const firstIdentity: AuthenticatedIdentity = {
      tenantId,
      userId: firstUserId,
      membershipId: firstMembershipId,
      sessionId: randomUUID(),
      tokenId: randomUUID(),
      securityVersion: 1,
    };
    const secondIdentity: AuthenticatedIdentity = {
      tenantId,
      userId: secondUserId,
      membershipId: secondMembershipId,
      sessionId: randomUUID(),
      tokenId: randomUUID(),
      securityVersion: 1,
    };

    const results = await Promise.allSettled([
      authorizationService.updateMembershipStatus(
        firstIdentity,
        secondMembershipId,
        { status: 'REVOKED' },
        { requestId: 'req-admin-race-a' },
      ),
      authorizationService.updateMembershipStatus(
        secondIdentity,
        firstMembershipId,
        { status: 'REVOKED' },
        { requestId: 'req-admin-race-b' },
      ),
    ]);

    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]).toMatchObject({
      reason: expect.any(ConflictException),
    });

    const memberships = await prisma.client.tenantMembership.findMany({
      where: {
        id: { in: [firstMembershipId, secondMembershipId] },
      },
      select: { status: true },
    });

    expect(memberships.filter((membership) => membership.status === 'ACTIVE')).toHaveLength(1);
    expect(memberships.filter((membership) => membership.status === 'REVOKED')).toHaveLength(1);

    await expect(
      prisma.client.auditEvent.count({
        where: {
          tenantId,
          eventType: 'authorization.membership.revoked',
          outcome: 'SUCCEEDED',
        },
      }),
    ).resolves.toBe(1);
  });

  it('rolls back membership, session, refresh credential, and tenant version when real audit persistence fails', async () => {
    const rollbackUserId = randomUUID();
    const rollbackMembershipId = randomUUID();
    const rollbackSessionId = randomUUID();
    const rollbackRefreshHash = `rollback-refresh-${randomUUID()}`;
    const expiresAt = new Date(Date.now() + 3600 * 1000);

    await prisma.client.user.create({
      data: {
        id: rollbackUserId,
        email: `rollback-${rollbackUserId}@medsphere.test`,
        firstName: 'Rollback',
        lastName: 'Audit',
        status: 'ACTIVE',
      },
    });

    await prisma.client.tenantMembership.create({
      data: {
        id: rollbackMembershipId,
        tenantId: tenantAId,
        userId: rollbackUserId,
        status: 'ACTIVE',
        joinedAt: new Date(),
      },
    });

    await sessionRepository.createSession({
      id: rollbackSessionId,
      userId: rollbackUserId,
      membershipId: rollbackMembershipId,
      tenantId: tenantAId,
      familyId: randomUUID(),
      refreshTokenHash: rollbackRefreshHash,
      expiresAt,
      absoluteExpiresAt: expiresAt,
      metadata: { requestId: 'req-rollback-session-create' },
    });

    const tenantBefore = await prisma.client.tenant.findUniqueOrThrow({
      where: { id: tenantAId },
      select: { version: true },
    });

    // AuditWriter writes ipAddress into PostgreSQL's inet column. The invalid
    // value fails at the real database after the business mutations have run,
    // forcing the entire serializable transaction to roll back.
    await expect(
      authorizationService.updateMembershipStatus(
        adminIdentity,
        rollbackMembershipId,
        { status: 'REVOKED' },
        {
          requestId: 'req-membership-audit-rollback',
          ipAddress: 'not-an-ip-address',
        },
      ),
    ).rejects.toBeDefined();

    const [membership, session, refreshCredential, tenantAfter, auditCount] = await Promise.all([
      prisma.client.tenantMembership.findUniqueOrThrow({
        where: { id: rollbackMembershipId },
      }),
      prisma.client.userSession.findUniqueOrThrow({
        where: { id: rollbackSessionId },
      }),
      prisma.client.userSessionRefreshCredential.findUniqueOrThrow({
        where: { hash: rollbackRefreshHash },
      }),
      prisma.client.tenant.findUniqueOrThrow({
        where: { id: tenantAId },
        select: { version: true },
      }),
      prisma.client.auditEvent.count({
        where: {
          tenantId: tenantAId,
          resourceId: rollbackMembershipId,
          eventType: 'authorization.membership.revoked',
        },
      }),
    ]);

    expect(membership.status).toBe('ACTIVE');
    expect(membership.endedAt).toBeNull();
    expect(session.status).toBe('ACTIVE');
    expect(session.revokedAt).toBeNull();
    expect(refreshCredential.status).toBe('ACTIVE');
    expect(refreshCredential.revokedAt).toBeNull();
    expect(tenantAfter.version).toBe(tenantBefore.version);
    expect(auditCount).toBe(0);
  });

  it('strictly rejects cross-tenant staff membership revocation requests', async () => {
    // Admin in Tenant A tries to revoke membership in Tenant B -> NotFoundException (tenant scoped)
    await expect(
      authorizationService.updateMembershipStatus(
        adminIdentity, // Tenant A
        membershipBId, // Membership in Tenant B
        { status: 'SUSPENDED' },
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('strictly rejects self-suspension and self-revocation', async () => {
    await expect(
      authorizationService.updateMembershipStatus(adminIdentity, adminIdentity.membershipId, {
        status: 'SUSPENDED',
      }),
    ).rejects.toThrow(ForbiddenException);

    await expect(
      authorizationService.updateMembershipStatus(adminIdentity, adminIdentity.membershipId, {
        status: 'REVOKED',
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('attributes revocation evidence to the exact authenticated administrator', async () => {
    // The target membership must belong to a user who is not already a member
    // of tenant A (TenantMembership is unique per (tenantId, userId)).
    const targetUserId = randomUUID();
    const targetMembershipId = randomUUID();
    await prisma.client.user.create({
      data: {
        id: targetUserId,
        email: `target-${targetUserId}@medsphere.test`,
        passwordHash: 'integration-placeholder-hash',
        firstName: 'Target',
        lastName: 'User',
        status: 'ACTIVE',
      },
    });
    await prisma.client.tenantMembership.create({
      data: {
        id: targetMembershipId,
        tenantId: tenantAId,
        userId: targetUserId,
        status: 'ACTIVE',
        joinedAt: new Date(),
      },
    });

    await authorizationService.updateMembershipStatus(
      adminIdentity,
      targetMembershipId,
      { status: 'REVOKED' },
      { requestId: 'req-exact-admin-revoke' },
    );

    const evidence = await prisma.client.auditEvent.findFirstOrThrow({
      where: {
        tenantId: tenantAId,
        resourceId: targetMembershipId,
        eventType: 'authorization.membership.revoked',
        outcome: 'SUCCEEDED',
      },
    });
    // Task 0019: the evidence must name the exact administrator (not merely the
    // membership) so revocation actions remain attributable after any change.
    expect(evidence.actorUserId).toBe(secondAdminUserId);
    expect(evidence.actorMembershipId).toBe(adminMembershipAId);
    expect(evidence.tenantId).toBe(tenantAId);
  });

  it('writes immutable audit evidence and contains no sensitive credential data', async () => {
    const auditUserId = randomUUID();
    const auditMembershipId = randomUUID();

    await prisma.client.user.create({
      data: {
        id: auditUserId,
        email: `audit-${auditUserId}@medsphere.test`,
        firstName: 'Audit',
        lastName: 'User',
        status: 'ACTIVE',
      },
    });

    await prisma.client.tenantMembership.create({
      data: {
        id: auditMembershipId,
        tenantId: tenantAId,
        userId: auditUserId,
        status: 'ACTIVE',
        joinedAt: new Date(),
      },
    });

    await authorizationService.updateMembershipStatus(
      adminIdentity,
      auditMembershipId,
      { status: 'SUSPENDED' },
      { requestId: 'req-audit-check' },
    );

    const auditEvent = await prisma.client.auditEvent.findFirst({
      where: {
        tenantId: tenantAId,
        eventType: 'authorization.membership.suspended',
        resourceId: auditMembershipId,
      },
    });

    expect(auditEvent).not.toBeNull();
    expect(auditEvent?.outcome).toBe('SUCCEEDED');
    expect(auditEvent?.actorMembershipId).toBe(adminIdentity.membershipId);
    expect(auditEvent?.metadata).toEqual({
      targetMembershipId: auditMembershipId,
      previousStatus: 'ACTIVE',
      resultingStatus: 'SUSPENDED',
    });

    // Check no sensitive credential keys exist in audit event metadata
    const metadataStr = JSON.stringify(auditEvent?.metadata ?? {});
    expect(metadataStr).not.toContain('password');
    expect(metadataStr).not.toContain('token');
    expect(metadataStr).not.toContain('secret');
  });
});
