import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RbacRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createRole(data: {
    tenantId: string;
    name: string;
    description?: string;
    type?: 'SYSTEM' | 'TENANT';
  }) {
    return this.prisma.client.role.create({
      data: {
        tenantId: data.tenantId,
        name: data.name,
        description: data.description,
        type: data.type ?? 'TENANT',
      },
    });
  }

  async findRoleById(id: string) {
    return this.prisma.client.role.findUnique({
      where: { id },
      include: {
        rolePermissions: {
          include: { permission: true },
        },
        userRoles: {
          include: { user: true },
        },
      },
    });
  }

  async findAllRoles(tenantId?: string) {
    const where: Record<string, unknown> = { deletedAt: null };
    if (tenantId) {
      where.tenantId = tenantId;
    }
    return this.prisma.client.role.findMany({
      where,
      include: {
        rolePermissions: {
          include: { permission: true },
        },
        _count: { select: { userRoles: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async updateRole(
    id: string,
    data: {
      name?: string;
      description?: string;
      type?: 'SYSTEM' | 'TENANT';
    },
  ) {
    return this.prisma.client.role.update({
      where: { id },
      data,
      include: {
        rolePermissions: {
          include: { permission: true },
        },
      },
    });
  }

  async softDeleteRole(id: string) {
    return this.prisma.client.role.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async createPermission(data: { tenantId: string; name: string; description?: string }) {
    return this.prisma.client.permission.create({ data });
  }

  async findAllPermissions(tenantId?: string) {
    const where: Record<string, unknown> = { deletedAt: null };
    if (tenantId) {
      where.tenantId = tenantId;
    }
    return this.prisma.client.permission.findMany({
      where,
      orderBy: { name: 'asc' },
    });
  }

  async assignPermissionsToRole(roleId: string, permissionIds: string[]) {
    await this.prisma.client.rolePermission.deleteMany({
      where: { roleId },
    });

    if (permissionIds.length > 0) {
      await this.prisma.client.rolePermission.createMany({
        data: permissionIds.map((permissionId) => ({
          roleId,
          permissionId,
        })),
      });
    }
  }

  async assignRoleToUser(roleId: string, userId: string) {
    return this.prisma.client.userRole.upsert({
      where: { userId_roleId: { userId, roleId } },
      update: {},
      create: { userId, roleId },
    });
  }

  async removeRoleFromUser(roleId: string, userId: string) {
    return this.prisma.client.userRole.deleteMany({
      where: { userId, roleId },
    });
  }

  async getUserRoles(userId: string) {
    return this.prisma.client.userRole.findMany({
      where: { userId },
      include: {
        role: {
          include: {
            rolePermissions: {
              include: { permission: true },
            },
          },
        },
      },
    });
  }

  async getUserPermissions(userId: string): Promise<string[]> {
    const userRoles = await this.prisma.client.userRole.findMany({
      where: { userId },
      include: {
        role: {
          include: {
            rolePermissions: {
              include: { permission: true },
            },
          },
        },
      },
    });

    const permissions = new Set<string>();
    for (const userRole of userRoles) {
      for (const rp of userRole.role.rolePermissions) {
        permissions.add(rp.permission.name);
      }
    }
    return Array.from(permissions);
  }
}
