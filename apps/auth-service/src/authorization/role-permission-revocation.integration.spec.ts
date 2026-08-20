import { randomUUID } from 'node:crypto';
import { AuditWriter } from '../audit/audit-writer.service';
import { AuthenticatedIdentity } from '../auth/auth.types';
import {
  isInfrastructureTestEnabled,
  requireEnv,
} from '../auth/testing/infrastructure-test-gate';
import { PrismaService } from '../prisma/prisma.service';
import { AuthorizationRepository } from './authorization.repository';
import { AuthorizationService } from './authorization.service';
import { PERMISSIONS } from './permission.constants';

const infrastructure = isInfrastructureTestEnabled() ? describe : describe.skip;
if (isInfrastructureTestEnabled()) requireEnv('DATABASE_URL');

infrastructure('Post-audit Task 2 immediate role/permission revocation', () => {
  const prisma = new PrismaService();
  const authorizationService = new AuthorizationService(
    new AuthorizationRepository(prisma),
    new AuditWriter(),
  );

  const tenantId = randomUUID();
  const userId = randomUUID();
  const membershipId = randomUUID();

  const identity: AuthenticatedIdentity = { tenantId, userId, membershipId };

  beforeAll(async () => {
    await prisma.client.tenant.create({
      data: {
        id: tenantId,
        name: 'Task2-RPR tenant',
        slug: `task2-rpr-${tenantId}`,
      },
    });
    await prisma.client.user.create({
      data: {
        id: userId,
        email: `${userId}@medsphere.test`,
        passwordHash: 'integration-only-placeholder',
        firstName: 'Role',
        lastName: 'Revocation',
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

  afterAll(async () => prisma.client.$disconnect());

  it('denies the same authenticated session immediately after its role assignment is removed', async () => {
    const roleId = randomUUID();
    const membershipRoleId = randomUUID();
    const permission = await prisma.client.permission.findUniqueOrThrow({
      where: { name: PERMISSIONS.inventoryStockRead },
    });

    await prisma.client.role.create({
      data: {
        id: roleId,
        tenantId,
        name: `Task2-RPR role ${roleId}`,
        type: 'TENANT',
      },
    });
    await prisma.client.rolePermission.create({
      data: {
        id: randomUUID(),
        tenantId,
        roleId,
        permissionId: permission.id,
      },
    });
    await prisma.client.membershipRole.create({
      data: { id: membershipRoleId, tenantId, membershipId, roleId },
    });

    // Step 1: the actor's session genuinely has the permission; the check succeeds.
    await expect(
      authorizationService.hasAllPermissions(identity, [PERMISSIONS.inventoryStockRead]),
    ).resolves.toBe(true);

    // Step 2: an administrator removes the role assignment through authoritative
    // PostgreSQL state. The `identity` object above is never mutated — the same
    // object a live session would carry is reused verbatim below.
    await prisma.client.membershipRole.delete({ where: { id: membershipRoleId } });

    // Step 3: the identical, still-authenticated actor immediately retries. No new
    // login or token refresh occurs.
    await expect(
      authorizationService.hasAllPermissions(identity, [PERMISSIONS.inventoryStockRead]),
    ).resolves.toBe(false);
  });

  it('denies the same authenticated session immediately after its permission mapping is removed', async () => {
    const roleId = randomUUID();
    const membershipRoleId = randomUUID();
    const rolePermissionId = randomUUID();
    const permission = await prisma.client.permission.findUniqueOrThrow({
      where: { name: PERMISSIONS.inventoryReservationsRead },
    });

    await prisma.client.role.create({
      data: {
        id: roleId,
        tenantId,
        name: `Task2-RPR mapping role ${roleId}`,
        type: 'TENANT',
      },
    });
    await prisma.client.rolePermission.create({
      data: {
        id: rolePermissionId,
        tenantId,
        roleId,
        permissionId: permission.id,
      },
    });
    await prisma.client.membershipRole.create({
      data: { id: membershipRoleId, tenantId, membershipId, roleId },
    });

    // Step 1: the role still exists and still carries the permission mapping.
    await expect(
      authorizationService.hasAllPermissions(identity, [PERMISSIONS.inventoryReservationsRead]),
    ).resolves.toBe(true);

    // Step 2: only the permission mapping is removed — the role assignment itself
    // is left in place, isolating this from the role-removal scenario above.
    await prisma.client.rolePermission.delete({ where: { id: rolePermissionId } });

    // Step 3: same session, immediate retry, no new token.
    await expect(
      authorizationService.hasAllPermissions(identity, [PERMISSIONS.inventoryReservationsRead]),
    ).resolves.toBe(false);
  });
});
