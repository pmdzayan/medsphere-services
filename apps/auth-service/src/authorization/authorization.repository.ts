import { Injectable } from '@nestjs/common';
import { Prisma } from '@medsphere/database';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedIdentity } from '../auth/auth.types';
import { PermissionKey, TENANT_ADMINISTRATOR_ROLE } from './permission.constants';

type AuthorizationDatabase = Pick<
  Prisma.TransactionClient,
  'membershipRole' | 'permission' | 'role' | 'rolePermission' | 'tenant' | 'tenantMembership'
>;

const roleInclude = {
  rolePermissions: {
    include: { permission: true },
    orderBy: { permission: { name: 'asc' as const } },
  },
  _count: { select: { roleAssignments: true } },
} as const;

@Injectable()
export class AuthorizationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findEffectivePermissions(identity: AuthenticatedIdentity): Promise<PermissionKey[]> {
    const assignments = await this.prisma.client.membershipRole.findMany({
      where: {
        tenantId: identity.tenantId,
        membershipId: identity.membershipId,
        membership: {
          userId: identity.userId,
          status: 'ACTIVE',
          deletedAt: null,
          tenant: {
            id: identity.tenantId,
            isActive: true,
            deletedAt: null,
          },
        },
        role: {
          deletedAt: null,
        },
      },
      select: {
        role: {
          select: {
            rolePermissions: {
              select: {
                permission: { select: { name: true } },
              },
            },
          },
        },
      },
    });

    const keys = new Set<PermissionKey>();
    for (const assignment of assignments) {
      for (const mapping of assignment.role.rolePermissions) {
        keys.add(mapping.permission.name as PermissionKey);
      }
    }
    return [...keys];
  }

  async listPermissions() {
    return this.prisma.client.permission.findMany({ orderBy: { name: 'asc' } });
  }

  async findPermissions(database: AuthorizationDatabase, permissionKeys: readonly PermissionKey[]) {
    return database.permission.findMany({
      where: { name: { in: [...permissionKeys] } },
      orderBy: { name: 'asc' },
    });
  }

  async listRoles(tenantId: string, limit: number, offset: number) {
    const where = { tenantId, deletedAt: null };
    const [data, total] = await Promise.all([
      this.prisma.client.role.findMany({
        where,
        include: roleInclude,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        take: limit,
        skip: offset,
      }),
      this.prisma.client.role.count({ where }),
    ]);
    return { data, total };
  }

  async findRole(database: AuthorizationDatabase, tenantId: string, roleId: string) {
    return database.role.findFirst({
      where: { id: roleId, tenantId, deletedAt: null },
      include: roleInclude,
    });
  }

  async findRoleByName(database: AuthorizationDatabase, tenantId: string, name: string) {
    return database.role.findFirst({
      where: { tenantId, name, deletedAt: null },
      select: { id: true },
    });
  }

  async createRole(
    database: AuthorizationDatabase,
    data: { tenantId: string; name: string; description?: string },
  ) {
    return database.role.create({
      data: {
        tenantId: data.tenantId,
        name: data.name,
        description: data.description,
        type: 'TENANT',
      },
      select: { id: true, version: true },
    });
  }

  async updateRoleVersioned(
    database: AuthorizationDatabase,
    data: {
      tenantId: string;
      roleId: string;
      expectedVersion: number;
      name?: string;
      description?: string;
    },
  ) {
    return database.role.updateMany({
      where: {
        id: data.roleId,
        tenantId: data.tenantId,
        version: data.expectedVersion,
        type: 'TENANT',
        deletedAt: null,
      },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        version: { increment: 1 },
      },
    });
  }

  async softDeleteRoleVersioned(
    database: AuthorizationDatabase,
    tenantId: string,
    roleId: string,
    expectedVersion: number,
  ) {
    return database.role.updateMany({
      where: {
        id: roleId,
        tenantId,
        version: expectedVersion,
        type: 'TENANT',
        deletedAt: null,
      },
      data: {
        deletedAt: new Date(),
        version: { increment: 1 },
      },
    });
  }

  async replaceRolePermissions(
    database: AuthorizationDatabase,
    tenantId: string,
    roleId: string,
    permissionIds: readonly string[],
  ): Promise<void> {
    await database.rolePermission.deleteMany({ where: { tenantId, roleId } });
    if (permissionIds.length > 0) {
      await database.rolePermission.createMany({
        data: permissionIds.map((permissionId) => ({
          tenantId,
          roleId,
          permissionId,
        })),
      });
    }
  }

  async findMembership(
    database: AuthorizationDatabase,
    tenantId: string,
    membershipId: string,
    requireActive: boolean,
  ) {
    return database.tenantMembership.findFirst({
      where: {
        id: membershipId,
        tenantId,
        deletedAt: null,
        ...(requireActive ? { status: 'ACTIVE' as const } : {}),
      },
      select: { id: true, status: true },
    });
  }

  async listMembershipRoles(tenantId: string, membershipId: string) {
    return this.prisma.client.membershipRole.findMany({
      where: {
        tenantId,
        membershipId,
        role: { deletedAt: null },
      },
      select: {
        membershipId: true,
        roleId: true,
        role: { select: { name: true } },
      },
      orderBy: { role: { name: 'asc' } },
    });
  }

  async findAssignment(
    database: AuthorizationDatabase,
    tenantId: string,
    membershipId: string,
    roleId: string,
  ) {
    return database.membershipRole.findFirst({
      where: { tenantId, membershipId, roleId },
      select: { id: true },
    });
  }

  async createAssignment(
    database: AuthorizationDatabase,
    tenantId: string,
    membershipId: string,
    roleId: string,
  ) {
    return database.membershipRole.create({
      data: { tenantId, membershipId, roleId },
      select: { id: true },
    });
  }

  async removeAssignment(
    database: AuthorizationDatabase,
    tenantId: string,
    membershipId: string,
    roleId: string,
  ) {
    return database.membershipRole.deleteMany({
      where: { tenantId, membershipId, roleId },
    });
  }

  async bumpTenantVersion(database: AuthorizationDatabase, tenantId: string): Promise<void> {
    const result = await database.tenant.updateMany({
      where: { id: tenantId, isActive: true, deletedAt: null },
      data: { version: { increment: 1 } },
    });
    if (result.count !== 1) {
      throw new Error('Active tenant boundary is unavailable');
    }
  }

  async countActiveTenantAdministrators(
    database: AuthorizationDatabase,
    tenantId: string,
  ): Promise<number> {
    return database.membershipRole.count({
      where: {
        tenantId,
        role: {
          name: TENANT_ADMINISTRATOR_ROLE,
          type: 'SYSTEM',
          deletedAt: null,
        },
        membership: {
          status: 'ACTIVE',
          deletedAt: null,
        },
      },
    });
  }

  get transactionClient() {
    return this.prisma.client;
  }
}
