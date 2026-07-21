import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { RbacRepository } from './rbac.repository';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

@Injectable()
export class RbacService {
  constructor(private readonly repository: RbacRepository) {}

  async createRole(dto: CreateRoleDto) {
    const existingRoles = await this.repository.findAllRoles(dto.tenantId);
    const duplicate = (existingRoles as Array<Record<string, unknown>>).find(
      (r) => r.name === dto.name && !r.deletedAt,
    );
    if (duplicate) {
      throw new ConflictException(`Role "${dto.name}" already exists`);
    }

    const role = await this.repository.createRole({
      tenantId: dto.tenantId,
      name: dto.name,
      description: dto.description,
      type: (dto.type as 'SYSTEM' | 'TENANT') ?? 'TENANT',
    });

    if (dto.permissionIds && dto.permissionIds.length > 0) {
      await this.repository.assignPermissionsToRole(role.id, dto.permissionIds);
    }

    return this.repository.findRoleById(role.id);
  }

  async findRoleById(id: string) {
    const role = await this.repository.findRoleById(id);
    if (!role || role.deletedAt) {
      throw new NotFoundException('Role not found');
    }
    return role;
  }

  async findAllRoles(tenantId?: string) {
    return this.repository.findAllRoles(tenantId);
  }

  async updateRole(id: string, dto: UpdateRoleDto) {
    const existing = await this.repository.findRoleById(id);
    if (!existing || existing.deletedAt) {
      throw new NotFoundException('Role not found');
    }

    const updateData: Record<string, unknown> = {};
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.type !== undefined) updateData.type = dto.type;

    if (Object.keys(updateData).length > 0) {
      await this.repository.updateRole(
        id,
        updateData as unknown as Parameters<typeof this.repository.updateRole>[1],
      );
    }

    if (dto.permissionIds !== undefined) {
      await this.repository.assignPermissionsToRole(id, dto.permissionIds);
    }

    return this.repository.findRoleById(id);
  }

  async removeRole(id: string): Promise<void> {
    const existing = await this.repository.findRoleById(id);
    if (!existing || existing.deletedAt) {
      throw new NotFoundException('Role not found');
    }
    await this.repository.softDeleteRole(id);
  }

  async assignRoleToUser(roleId: string, tenantMembershipId: string) {
    const role = await this.repository.findRoleById(roleId);
    if (!role || role.deletedAt) {
      throw new NotFoundException('Role not found');
    }
    return this.repository.assignRoleToUser(roleId, tenantMembershipId);
  }

  async removeRoleFromUser(roleId: string, tenantMembershipId: string) {
    const result = await this.repository.removeRoleFromUser(roleId, tenantMembershipId);
    if (result.count === 0) {
      throw new BadRequestException('User does not have this role assigned');
    }
    return { message: 'Role removed from user successfully' };
  }

  async getUserRoles(tenantMembershipId: string) {
    return this.repository.getUserRoles(tenantMembershipId);
  }

  async getUserPermissions(userId: string): Promise<string[]> {
    return this.repository.getUserPermissions(userId);
  }

  async getUserPermissionsByMembership(tenantMembershipId: string): Promise<string[]> {
    return this.repository.getUserPermissionsByMembership(tenantMembershipId);
  }

  async findTenantMembership(tenantId: string, userId: string) {
    return this.repository.findTenantMembership(tenantId, userId);
  }

  async listPermissions() {
    return this.repository.findAllPermissions();
  }
}
