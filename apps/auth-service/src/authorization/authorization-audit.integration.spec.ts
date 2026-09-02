import { randomUUID } from 'node:crypto';
import { AuditRepository } from '../audit/audit.repository';
import { AuditService } from '../audit/audit.service';
import { AuditWriter } from '../audit/audit-writer.service';
import { AuditEventQueryDto } from '../audit/dto/audit-event-query.dto';
import { AuthenticatedIdentity } from '../auth/auth.types';
import { isInfrastructureTestEnabled, requireEnv } from '../auth/testing/infrastructure-test-gate';
import { PrismaService } from '../prisma/prisma.service';
import { AuthorizationRepository } from './authorization.repository';
import { AuthorizationService } from './authorization.service';
import { PERMISSION_KEYS, PERMISSIONS, TENANT_ADMINISTRATOR_ROLE } from './permission.constants';

const describeAuthorizationInfra = isInfrastructureTestEnabled() ? describe : describe.skip;

if (isInfrastructureTestEnabled()) {
  requireEnv('DATABASE_URL');
}

describeAuthorizationInfra('S0.4 PostgreSQL authorization and durable-audit integrity', () => {
  const prisma = new PrismaService();
  const auditWriter = new AuditWriter();
  const authorizationRepository = new AuthorizationRepository(prisma);
  const authorizationService = new AuthorizationService(authorizationRepository, auditWriter);
  const auditService = new AuditService(new AuditRepository(prisma));

  const tenantAId = randomUUID();
  const tenantBId = randomUUID();
  const sharedUserId = randomUUID();
  const secondAdministratorUserId = randomUUID();
  const membershipAId = randomUUID();
  const membershipBId = randomUUID();
  const membershipA2Id = randomUUID();
  const administratorAId = randomUUID();
  const administratorBId = randomUUID();
  const tenantBReaderRoleId = randomUUID();
  const providerAId = randomUUID();
  const providerBId = randomUUID();

  const identityA: AuthenticatedIdentity = {
    userId: sharedUserId,
    membershipId: membershipAId,
    tenantId: tenantAId,
    sessionId: randomUUID(),
    tokenId: randomUUID(),
    securityVersion: 1,
  };
  const identityB: AuthenticatedIdentity = {
    userId: sharedUserId,
    membershipId: membershipBId,
    tenantId: tenantBId,
    sessionId: randomUUID(),
    tokenId: randomUUID(),
    securityVersion: 1,
  };
  const identityA2: AuthenticatedIdentity = {
    userId: secondAdministratorUserId,
    membershipId: membershipA2Id,
    tenantId: tenantAId,
    sessionId: randomUUID(),
    tokenId: randomUUID(),
    securityVersion: 1,
  };

  beforeAll(async () => {
    const permissions = await prisma.client.permission.findMany({
      where: { name: { in: [...PERMISSION_KEYS] } },
      select: { id: true, name: true },
    });
    expect(permissions.map((permission) => permission.name).sort()).toEqual(
      [...PERMISSION_KEYS].sort(),
    );

    await prisma.client.tenant.createMany({
      data: [
        { id: tenantAId, name: 'S0.4 Tenant A', slug: `s04-a-${tenantAId}` },
        { id: tenantBId, name: 'S0.4 Tenant B', slug: `s04-b-${tenantBId}` },
      ],
    });
    await prisma.client.user.createMany({
      data: [
        {
          id: sharedUserId,
          email: `${sharedUserId}@medsphere.test`,
          passwordHash: 'integration-only-placeholder',
          firstName: 'Shared',
          lastName: 'User',
        },
        {
          id: secondAdministratorUserId,
          email: `${secondAdministratorUserId}@medsphere.test`,
          passwordHash: 'integration-only-placeholder',
          firstName: 'Second',
          lastName: 'Administrator',
        },
      ],
    });
    await prisma.client.tenantMembership.createMany({
      data: [
        {
          id: membershipAId,
          tenantId: tenantAId,
          userId: sharedUserId,
          status: 'ACTIVE',
          joinedAt: new Date(),
        },
        {
          id: membershipBId,
          tenantId: tenantBId,
          userId: sharedUserId,
          status: 'ACTIVE',
          joinedAt: new Date(),
        },
        {
          id: membershipA2Id,
          tenantId: tenantAId,
          userId: secondAdministratorUserId,
          status: 'ACTIVE',
          joinedAt: new Date(),
        },
      ],
    });
    await prisma.client.role.createMany({
      data: [
        {
          id: administratorAId,
          tenantId: tenantAId,
          name: TENANT_ADMINISTRATOR_ROLE,
          description: 'Integration administrator A',
          type: 'SYSTEM',
        },
        {
          id: administratorBId,
          tenantId: tenantBId,
          name: TENANT_ADMINISTRATOR_ROLE,
          description: 'Integration administrator B',
          type: 'SYSTEM',
        },
        {
          id: tenantBReaderRoleId,
          tenantId: tenantBId,
          name: 'ROLE_READER',
          description: 'Integration reader',
          type: 'TENANT',
        },
      ],
    });
    await prisma.client.rolePermission.createMany({
      data: [
        ...permissions.map((permission) => ({
          id: randomUUID(),
          tenantId: tenantAId,
          roleId: administratorAId,
          permissionId: permission.id,
        })),
        {
          id: randomUUID(),
          tenantId: tenantBId,
          roleId: tenantBReaderRoleId,
          permissionId: requirePermissionId(permissions, PERMISSIONS.rolesRead),
        },
      ],
    });
    await prisma.client.membershipRole.createMany({
      data: [
        {
          id: randomUUID(),
          tenantId: tenantAId,
          membershipId: membershipAId,
          roleId: administratorAId,
        },
        {
          id: randomUUID(),
          tenantId: tenantAId,
          membershipId: membershipA2Id,
          roleId: administratorAId,
        },
        {
          id: randomUUID(),
          tenantId: tenantBId,
          membershipId: membershipBId,
          roleId: tenantBReaderRoleId,
        },
      ],
    });
    await prisma.client.provider.createMany({
      data: [
        providerFixture(providerAId, tenantAId, 'Tenant A Pharmacy', 'a'),
        providerFixture(providerBId, tenantBId, 'Tenant B Hospital', 'b', 'HOSPITAL'),
      ],
    });
  });

  afterAll(async () => {
    await prisma.client.$disconnect();
  });

  it('isolates permissions for one global user across two active tenant memberships', async () => {
    await expect(
      authorizationService.hasAllPermissions(identityA, [PERMISSIONS.assignmentsManage]),
    ).resolves.toBe(true);
    await expect(
      authorizationService.hasAllPermissions(identityB, [PERMISSIONS.rolesRead]),
    ).resolves.toBe(true);
    await expect(
      authorizationService.hasAllPermissions(identityB, [PERMISSIONS.assignmentsManage]),
    ).resolves.toBe(false);
  });

  it('rejects cross-tenant membership-role and role-permission relationships', async () => {
    await expect(
      prisma.client.membershipRole.create({
        data: {
          id: randomUUID(),
          tenantId: tenantBId,
          membershipId: membershipAId,
          roleId: administratorBId,
        },
      }),
    ).rejects.toBeDefined();

    const permission = await prisma.client.permission.findUniqueOrThrow({
      where: { name: PERMISSIONS.rolesRead },
    });
    await expect(
      prisma.client.rolePermission.create({
        data: {
          id: randomUUID(),
          tenantId: tenantAId,
          roleId: tenantBReaderRoleId,
          permissionId: permission.id,
        },
      }),
    ).rejects.toBeDefined();
  });

  it('rejects cross-tenant provider access and persists tenant-safe assignment evidence', async () => {
    await expect(
      prisma.client.membershipProviderAccess.create({
        data: {
          tenantId: tenantAId,
          membershipId: membershipAId,
          providerId: providerBId,
        },
      }),
    ).rejects.toBeDefined();

    await expect(
      authorizationService.addProviderAccess(identityA, membershipAId, providerAId),
    ).resolves.toMatchObject({ membershipId: membershipAId, providerId: providerAId });
    await expect(
      prisma.client.auditEvent.count({
        where: {
          tenantId: tenantAId,
          eventType: 'authorization.provider-access.added',
          resourceId: `${membershipAId}:${providerAId}`,
        },
      }),
    ).resolves.toBe(1);
  });

  it('keeps the permission catalogue migration-owned and built-in role shape constrained', async () => {
    await expect(
      prisma.client.permission.update({
        where: { name: PERMISSIONS.rolesRead },
        data: { description: 'Runtime mutation must fail' },
      }),
    ).rejects.toBeDefined();

    await expect(
      prisma.client.role.create({
        data: {
          tenantId: tenantAId,
          name: 'UNREVIEWED_SYSTEM_ROLE',
          type: 'SYSTEM',
        },
      }),
    ).rejects.toBeDefined();
    await expect(
      prisma.client.role.create({
        data: {
          tenantId: tenantAId,
          name: TENANT_ADMINISTRATOR_ROLE,
          type: 'TENANT',
        },
      }),
    ).rejects.toBeDefined();
  });

  it('rejects cross-tenant actors and direct audit update or delete', async () => {
    await expect(
      auditWriter.appendTenantUser(prisma.client, {
        tenantId: tenantAId,
        actorMembershipId: membershipBId,
        eventType: 'authorization.permission.denied',
        outcome: 'DENIED',
        metadata: { requiredPermissions: PERMISSIONS.rolesDelete },
      }),
    ).rejects.toBeDefined();

    await auditWriter.appendTenantUser(prisma.client, {
      tenantId: tenantAId,
      actorMembershipId: membershipAId,
      eventType: 'authorization.permission.denied',
      outcome: 'DENIED',
      metadata: { requiredPermissions: PERMISSIONS.rolesDelete },
    });
    const event = await prisma.client.auditEvent.findFirstOrThrow({
      where: {
        tenantId: tenantAId,
        actorMembershipId: membershipAId,
        eventType: 'authorization.permission.denied',
      },
      orderBy: { occurredAt: 'desc' },
    });

    await expect(
      prisma.client.auditEvent.update({
        where: { id: event.id },
        data: { outcome: 'SUCCEEDED' },
      }),
    ).rejects.toBeDefined();
    await expect(
      prisma.client.auditEvent.delete({ where: { id: event.id } }),
    ).rejects.toBeDefined();
  });

  it('enforces accepted actor shapes and metadata bounds below the application layer', async () => {
    await expect(
      prisma.client.auditEvent.create({
        data: {
          id: randomUUID(),
          scope: 'TENANT',
          actorType: 'SYSTEM',
          outcome: 'SUCCEEDED',
          tenantId: tenantAId,
          eventType: 'inventory.reservation.expired',
          metadata: {},
        },
      }),
    ).resolves.toMatchObject({
      scope: 'TENANT',
      actorType: 'SYSTEM',
      tenantId: tenantAId,
      actorMembershipId: null,
      platformActorUserId: null,
    });

    await expect(
      prisma.client.auditEvent.create({
        data: {
          id: randomUUID(),
          scope: 'TENANT',
          actorType: 'SYSTEM',
          outcome: 'FAILED',
          tenantId: tenantAId,
          actorMembershipId: membershipAId,
          eventType: 'inventory.reservation.expired',
          metadata: {},
        },
      }),
    ).rejects.toBeDefined();

    await expect(
      prisma.client.auditEvent.create({
        data: {
          id: randomUUID(),
          scope: 'TENANT',
          actorType: 'TENANT_USER',
          outcome: 'FAILED',
          tenantId: tenantAId,
          actorMembershipId: membershipAId,
          eventType: 'authentication.session.refresh.failed',
          metadata: ['not-an-object'],
        },
      }),
    ).rejects.toBeDefined();

    await expect(
      prisma.client.auditEvent.create({
        data: {
          id: randomUUID(),
          scope: 'TENANT',
          actorType: 'TENANT_USER',
          outcome: 'FAILED',
          tenantId: tenantAId,
          actorMembershipId: membershipAId,
          eventType: 'authentication.session.refresh.failed',
          metadata: { reason: 'x'.repeat(17_000) },
        },
      }),
    ).rejects.toBeDefined();
  });

  it('rolls back a protected role mutation when its audit insert fails', async () => {
    const roleName = `ROLLBACK_PROBE_${randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`;

    await expect(
      authorizationService.createRole(
        identityA,
        {
          name: roleName,
          permissionKeys: [PERMISSIONS.rolesRead],
        },
        { ipAddress: 'not-an-ip-address' },
      ),
    ).rejects.toBeDefined();

    await expect(
      prisma.client.role.findFirst({ where: { tenantId: tenantAId, name: roleName } }),
    ).resolves.toBeNull();
  });

  it('allows one winner for concurrent strong role-version updates', async () => {
    const role = await prisma.client.role.create({
      data: {
        tenantId: tenantAId,
        name: `VERSION_PROBE_${randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`,
        type: 'TENANT',
      },
    });

    const results = await Promise.allSettled([
      authorizationService.updateRole(identityA, role.id, 1, { description: 'Winner A' }),
      authorizationService.updateRole(identityA2, role.id, 1, { description: 'Winner B' }),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    await expect(
      prisma.client.role.findUniqueOrThrow({ where: { id: role.id } }),
    ).resolves.toMatchObject({ version: 2 });
    await expect(
      prisma.client.auditEvent.count({
        where: {
          tenantId: tenantAId,
          eventType: 'authorization.role.updated',
          resourceId: role.id,
        },
      }),
    ).resolves.toBe(1);
  });

  it('keeps concurrent assignment PUT semantics idempotent with one audit event', async () => {
    const role = await prisma.client.role.create({
      data: {
        tenantId: tenantAId,
        name: `ASSIGNMENT_PROBE_${randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`,
        type: 'TENANT',
      },
    });

    const results = await Promise.allSettled([
      authorizationService.addAssignment(identityA, membershipA2Id, role.id),
      authorizationService.addAssignment(identityA, membershipA2Id, role.id),
    ]);

    expect(results.every((result) => result.status === 'fulfilled')).toBe(true);
    await expect(
      prisma.client.membershipRole.count({
        where: { tenantId: tenantAId, membershipId: membershipA2Id, roleId: role.id },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.client.auditEvent.count({
        where: {
          tenantId: tenantAId,
          eventType: 'authorization.assignment.added',
          resourceId: `${membershipA2Id}:${role.id}`,
        },
      }),
    ).resolves.toBe(1);
  });

  it('serializes concurrent removals and preserves one active tenant administrator', async () => {
    const results = await Promise.allSettled([
      authorizationService.removeAssignment(identityA, membershipAId, administratorAId),
      authorizationService.removeAssignment(identityA2, membershipA2Id, administratorAId),
    ]);

    const fulfilled = results.filter(
      (result): result is PromiseFulfilledResult<void> => result.status === 'fulfilled',
    );
    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    // Fail-closed error contract: the safe, established message only --
    // no internal SQL/constraint detail, no sensitive tenant data.
    expect((rejected[0].reason as Error).message).toBe(
      'The last active tenant administrator cannot be removed',
    );

    await expect(
      prisma.client.membershipRole.count({
        where: {
          tenantId: tenantAId,
          roleId: administratorAId,
          membership: { status: 'ACTIVE', deletedAt: null },
        },
      }),
    ).resolves.toBe(1);

    // Audit integrity: exactly one accurate SUCCEEDED record for the
    // winning removal, correctly scoped to actor/tenant/resource -- and
    // no audit event at all for the losing attempt, since it is rejected
    // before the transaction ever reaches the audit write. A rejected
    // last-admin mutation must never produce a misleading success record,
    // and it must not produce a contradictory one either.
    const removalEvents = await prisma.client.auditEvent.findMany({
      where: {
        tenantId: tenantAId,
        eventType: 'authorization.assignment.removed',
        resourceId: `${membershipAId}:${administratorAId}`,
      },
    });
    const removalEventsOther = await prisma.client.auditEvent.findMany({
      where: {
        tenantId: tenantAId,
        eventType: 'authorization.assignment.removed',
        resourceId: `${membershipA2Id}:${administratorAId}`,
      },
    });
    const allRemovalEvents = [...removalEvents, ...removalEventsOther];
    expect(allRemovalEvents).toHaveLength(1);
    const [winningEvent] = allRemovalEvents;
    expect(winningEvent.outcome).toBe('SUCCEEDED');
    expect(winningEvent.tenantId).toBe(tenantAId);
    expect([membershipAId, membershipA2Id]).toContain(winningEvent.actorMembershipId);
    expect(
      winningEvent.resourceId === `${membershipAId}:${administratorAId}` ||
        winningEvent.resourceId === `${membershipA2Id}:${administratorAId}`,
    ).toBe(true);

    // A subsequent client-level retry against the now-sole remaining
    // administrator must also fail closed -- proving the invariant holds
    // beyond the internal SERIALIZABLE retry already exercised by the
    // race above, not just within it. The retry is performed by whichever
    // identity's own membership is the surviving administrator -- not
    // unconditionally identityA -- so a rejection can only be attributed
    // to the last-admin invariant guard itself, never to the caller's own
    // authority having been removed by the race.
    const remainingMembershipId =
      winningEvent.resourceId === `${membershipAId}:${administratorAId}`
        ? membershipA2Id
        : membershipAId;
    const remainingIdentity = remainingMembershipId === membershipAId ? identityA : identityA2;
    await expect(
      authorizationService.removeAssignment(
        remainingIdentity,
        remainingMembershipId,
        administratorAId,
      ),
    ).rejects.toThrow('The last active tenant administrator cannot be removed');
    await expect(
      prisma.client.membershipRole.count({
        where: {
          tenantId: tenantAId,
          roleId: administratorAId,
          membership: { status: 'ACTIVE', deletedAt: null },
        },
      }),
    ).resolves.toBe(1);
  });

  it('keeps platform evidence out of stable tenant cursor pages', async () => {
    await auditWriter.appendPlatformUser(prisma.client, {
      platformActorUserId: sharedUserId,
      eventType: 'authentication.sessions.logout.succeeded',
      outcome: 'SUCCEEDED',
      resourceType: 'global-user-sessions',
      resourceId: sharedUserId,
      metadata: { revokedCount: 0 },
    });

    const occurredAt = new Date('2099-01-01T00:00:00.000Z');
    const [lowestId, highestId] = [randomUUID(), randomUUID()].sort();
    const resourceId = randomUUID();
    await prisma.client.auditEvent.createMany({
      data: [highestId, lowestId].map((id) => ({
        id,
        scope: 'TENANT' as const,
        actorType: 'TENANT_USER' as const,
        outcome: 'DENIED' as const,
        tenantId: tenantAId,
        actorMembershipId: membershipAId,
        eventType: 'authorization.permission.denied',
        resourceType: 'pagination-probe',
        resourceId,
        metadata: { requiredPermissions: PERMISSIONS.rolesDelete },
        occurredAt,
      })),
    });

    const firstQuery = queryForPagination(resourceId);
    const first = await auditService.listTenantEvents(identityA, firstQuery);
    expect(first.data.map((event) => event.id)).toEqual([highestId]);
    expect(first.nextCursor).toBe(highestId);

    const secondQuery = queryForPagination(resourceId);
    secondQuery.cursor = highestId;
    const second = await auditService.listTenantEvents(identityA, secondQuery);
    expect(second.data.map((event) => event.id)).toEqual([lowestId]);
    expect(second.nextCursor).toBeNull();

    const tenantEvents = await auditService.listTenantEvents(identityA, new AuditEventQueryDto());
    expect(
      tenantEvents.data.some(
        (event) =>
          event.eventType === 'authentication.sessions.logout.succeeded' &&
          event.resourceId === sharedUserId,
      ),
    ).toBe(false);
  });

  function queryForPagination(resourceId: string): AuditEventQueryDto {
    const query = new AuditEventQueryDto();
    query.limit = 1;
    query.resourceType = 'pagination-probe';
    query.resourceId = resourceId;
    return query;
  }

  function requirePermissionId(
    permissions: Array<{ id: string; name: string }>,
    name: string,
  ): string {
    const permission = permissions.find((candidate) => candidate.name === name);
    if (!permission) {
      throw new Error('Accepted permission catalogue is incomplete');
    }
    return permission.id;
  }

  function providerFixture(
    id: string,
    tenantId: string,
    businessName: string,
    suffix: string,
    providerType: 'PHARMACY' | 'HOSPITAL' = 'PHARMACY',
  ) {
    return {
      id,
      tenantId,
      providerType,
      businessName,
      ownerName: 'Integration Owner',
      email: `provider-${suffix}-${id}@medsphere.test`,
      phone: '0000000000',
      address: 'Integration address',
      city: 'Chennai',
      state: 'Tamil Nadu',
      country: 'India',
      postalCode: '600001',
      latitude: 13.0827,
      longitude: 80.2707,
      isVerified: true,
      isActive: true,
    } as const;
  }
});
