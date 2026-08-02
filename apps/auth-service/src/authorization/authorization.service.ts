import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  PreconditionFailedException,
} from '@nestjs/common';
import { Prisma } from '@medsphere/database';
import { AuthenticatedIdentity, RequestMetadata } from '../auth/auth.types';
import { AuditWriter } from '../audit/audit-writer.service';
import { hasPrismaCode, withSerializableRetry } from '../prisma/transaction.util';
import { AuthorizationRepository } from './authorization.repository';
import { AuthorizationListQueryDto } from './dto/authorization-list-query.dto';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import {
  AssignmentResponseDto,
  EffectivePermissionsResponseDto,
  MembershipListResponseDto,
  ProviderAccessResponseDto,
  RoleListResponseDto,
  RoleResponseDto,
} from './dto/authorization-response.dto';
import { PermissionKey, TENANT_ADMINISTRATOR_ROLE } from './permission.constants';

@Injectable()
export class AuthorizationService {
  constructor(
    private readonly repository: AuthorizationRepository,
    private readonly auditWriter: AuditWriter,
  ) {}

  async hasAllPermissions(
    identity: AuthenticatedIdentity,
    requiredPermissions: readonly PermissionKey[],
  ): Promise<boolean> {
    const permissions = await this.repository.findEffectivePermissions(identity);
    const effective = new Set<PermissionKey>(permissions);
    return requiredPermissions.every((permission) => effective.has(permission));
  }

  async listEffectivePermissions(
    identity: AuthenticatedIdentity,
  ): Promise<EffectivePermissionsResponseDto> {
    const permissionKeys = await this.repository.findEffectivePermissions(identity);
    return { permissionKeys: [...new Set(permissionKeys)].sort() };
  }

  listPermissions() {
    return this.repository.listPermissions();
  }

  async listRoles(
    identity: AuthenticatedIdentity,
    query: AuthorizationListQueryDto,
  ): Promise<RoleListResponseDto> {
    const result = await this.repository.listRoles(identity.tenantId, query.limit, query.offset);
    return {
      data: result.data.map((role) => this.mapRole(role)),
      total: result.total,
      limit: query.limit,
      offset: query.offset,
    };
  }

  async findRole(identity: AuthenticatedIdentity, roleId: string): Promise<RoleResponseDto> {
    const role = await this.repository.findRole(
      this.repository.transactionClient,
      identity.tenantId,
      roleId,
    );
    if (!role) {
      throw new NotFoundException('Role not found');
    }
    return this.mapRole(role);
  }

  async createRole(
    identity: AuthenticatedIdentity,
    dto: CreateRoleDto,
    request: RequestMetadata = {},
  ): Promise<RoleResponseDto> {
    try {
      return await withSerializableRetry(this.repository.transactionClient, async (transaction) => {
        if (dto.name === TENANT_ADMINISTRATOR_ROLE) {
          throw new ConflictException('Role name is reserved');
        }
        if (await this.repository.findRoleByName(transaction, identity.tenantId, dto.name)) {
          throw new ConflictException('Role already exists');
        }

        const permissions = await this.requirePermissionCatalogue(transaction, dto.permissionKeys);
        const created = await this.repository.createRole(transaction, {
          tenantId: identity.tenantId,
          name: dto.name,
          description: dto.description,
        });
        await this.repository.replaceRolePermissions(
          transaction,
          identity.tenantId,
          created.id,
          permissions.map((permission) => permission.id),
        );
        await this.auditWriter.appendTenantUser(transaction, {
          tenantId: identity.tenantId,
          actorMembershipId: identity.membershipId,
          eventType: 'authorization.role.created',
          outcome: 'SUCCEEDED',
          resourceType: 'authorization-role',
          resourceId: created.id,
          metadata: {
            roleName: dto.name,
            roleVersion: created.version,
            permissionCount: permissions.length,
          },
          request,
        });

        const role = await this.repository.findRole(transaction, identity.tenantId, created.id);
        if (!role) {
          throw new Error('Created role was not readable inside its transaction');
        }
        return this.mapRole(role);
      });
    } catch (error) {
      if (hasPrismaCode(error, 'P2002')) {
        throw new ConflictException('Role already exists');
      }
      throw error;
    }
  }

  async updateRole(
    identity: AuthenticatedIdentity,
    roleId: string,
    expectedVersion: number,
    dto: UpdateRoleDto,
    request: RequestMetadata = {},
  ): Promise<RoleResponseDto> {
    if (
      dto.name === undefined &&
      dto.description === undefined &&
      dto.permissionKeys === undefined
    ) {
      throw new BadRequestException('At least one role field must be supplied');
    }

    try {
      return await withSerializableRetry(this.repository.transactionClient, async (transaction) => {
        const existing = await this.requireMutableRole(transaction, identity.tenantId, roleId);
        if (existing.version !== expectedVersion) {
          throw new PreconditionFailedException('Role version is stale');
        }
        if (
          dto.name !== undefined &&
          dto.name !== existing.name &&
          (await this.repository.findRoleByName(transaction, identity.tenantId, dto.name))
        ) {
          throw new ConflictException('Role already exists');
        }

        const permissions =
          dto.permissionKeys === undefined
            ? undefined
            : await this.requirePermissionCatalogue(transaction, dto.permissionKeys);
        const update = await this.repository.updateRoleVersioned(transaction, {
          tenantId: identity.tenantId,
          roleId,
          expectedVersion,
          name: dto.name,
          description: dto.description,
        });
        if (update.count !== 1) {
          throw new PreconditionFailedException('Role version is stale');
        }
        if (permissions !== undefined) {
          await this.repository.replaceRolePermissions(
            transaction,
            identity.tenantId,
            roleId,
            permissions.map((permission) => permission.id),
          );
        }

        const role = await this.repository.findRole(transaction, identity.tenantId, roleId);
        if (!role) {
          throw new Error('Updated role was not readable inside its transaction');
        }
        await this.auditWriter.appendTenantUser(transaction, {
          tenantId: identity.tenantId,
          actorMembershipId: identity.membershipId,
          eventType: 'authorization.role.updated',
          outcome: 'SUCCEEDED',
          resourceType: 'authorization-role',
          resourceId: roleId,
          metadata: {
            roleName: role.name,
            roleVersion: role.version,
            permissionCount: role.rolePermissions.length,
          },
          request,
        });
        return this.mapRole(role);
      });
    } catch (error) {
      if (hasPrismaCode(error, 'P2002')) {
        throw new ConflictException('Role already exists');
      }
      throw error;
    }
  }

  async deleteRole(
    identity: AuthenticatedIdentity,
    roleId: string,
    expectedVersion: number,
    request: RequestMetadata = {},
  ): Promise<void> {
    await withSerializableRetry(this.repository.transactionClient, async (transaction) => {
      const existing = await this.requireMutableRole(transaction, identity.tenantId, roleId);
      if (existing.version !== expectedVersion) {
        throw new PreconditionFailedException('Role version is stale');
      }
      const deleted = await this.repository.softDeleteRoleVersioned(
        transaction,
        identity.tenantId,
        roleId,
        expectedVersion,
      );
      if (deleted.count !== 1) {
        throw new PreconditionFailedException('Role version is stale');
      }
      await this.auditWriter.appendTenantUser(transaction, {
        tenantId: identity.tenantId,
        actorMembershipId: identity.membershipId,
        eventType: 'authorization.role.deleted',
        outcome: 'SUCCEEDED',
        resourceType: 'authorization-role',
        resourceId: roleId,
        metadata: {
          roleName: existing.name,
          roleVersion: expectedVersion + 1,
        },
        request,
      });
    });
  }

  async listMembershipRoles(
    identity: AuthenticatedIdentity,
    membershipId: string,
  ): Promise<AssignmentResponseDto[]> {
    const membership = await this.repository.findMembership(
      this.repository.transactionClient,
      identity.tenantId,
      membershipId,
      false,
    );
    if (!membership) {
      throw new NotFoundException('Membership not found');
    }
    const assignments = await this.repository.listMembershipRoles(identity.tenantId, membershipId);
    return assignments.map((assignment) => ({
      membershipId: assignment.membershipId,
      roleId: assignment.roleId,
      roleName: assignment.role.name,
    }));
  }

  async listMemberships(
    identity: AuthenticatedIdentity,
    query: AuthorizationListQueryDto,
  ): Promise<MembershipListResponseDto> {
    const result = await this.repository.listMemberships(
      identity.tenantId,
      query.limit,
      query.offset,
    );
    return {
      data: result.data.map((membership) => ({
        id: membership.id,
        userId: membership.userId,
        email: membership.user.email,
        firstName: membership.user.firstName,
        lastName: membership.user.lastName,
        status: membership.status,
        roles: membership.roleAssignments.map(({ role }) => role),
      })),
      total: result.total,
      limit: query.limit,
      offset: query.offset,
    };
  }

  async addAssignment(
    identity: AuthenticatedIdentity,
    membershipId: string,
    roleId: string,
    request: RequestMetadata = {},
  ): Promise<AssignmentResponseDto> {
    return withSerializableRetry(this.repository.transactionClient, async (transaction) => {
      const [membership, role] = await Promise.all([
        this.repository.findMembership(transaction, identity.tenantId, membershipId, true),
        this.repository.findRole(transaction, identity.tenantId, roleId),
      ]);
      if (!membership || !role) {
        throw new NotFoundException('Membership or role not found');
      }
      const existing = await this.repository.findAssignment(
        transaction,
        identity.tenantId,
        membershipId,
        roleId,
      );
      if (!existing) {
        const created = await this.repository.createAssignment(
          transaction,
          identity.tenantId,
          membershipId,
          roleId,
        );
        if (created.count === 1) {
          await this.auditWriter.appendTenantUser(transaction, {
            tenantId: identity.tenantId,
            actorMembershipId: identity.membershipId,
            eventType: 'authorization.assignment.added',
            outcome: 'SUCCEEDED',
            resourceType: 'membership-role-assignment',
            resourceId: `${membershipId}:${roleId}`,
            metadata: {
              targetMembershipId: membershipId,
              roleName: role.name,
            },
            request,
          });
        }
      }
      return { membershipId, roleId, roleName: role.name };
    });
  }

  async removeAssignment(
    identity: AuthenticatedIdentity,
    membershipId: string,
    roleId: string,
    request: RequestMetadata = {},
  ): Promise<void> {
    await withSerializableRetry(this.repository.transactionClient, async (transaction) => {
      await this.repository.bumpTenantVersion(transaction, identity.tenantId);
      const [membership, role, assignment] = await Promise.all([
        this.repository.findMembership(transaction, identity.tenantId, membershipId, false),
        this.repository.findRole(transaction, identity.tenantId, roleId),
        this.repository.findAssignment(transaction, identity.tenantId, membershipId, roleId),
      ]);
      if (!membership || !role || !assignment) {
        throw new NotFoundException('Role assignment not found');
      }
      if (
        role.type === 'SYSTEM' &&
        role.name === TENANT_ADMINISTRATOR_ROLE &&
        membership.status === 'ACTIVE'
      ) {
        const administrators = await this.repository.countActiveTenantAdministrators(
          transaction,
          identity.tenantId,
        );
        if (administrators <= 1) {
          throw new ConflictException('The last active tenant administrator cannot be removed');
        }
      }

      const removed = await this.repository.removeAssignment(
        transaction,
        identity.tenantId,
        membershipId,
        roleId,
      );
      if (removed.count !== 1) {
        throw new NotFoundException('Role assignment not found');
      }
      await this.auditWriter.appendTenantUser(transaction, {
        tenantId: identity.tenantId,
        actorMembershipId: identity.membershipId,
        eventType: 'authorization.assignment.removed',
        outcome: 'SUCCEEDED',
        resourceType: 'membership-role-assignment',
        resourceId: `${membershipId}:${roleId}`,
        metadata: {
          targetMembershipId: membershipId,
          roleName: role.name,
        },
        request,
      });
    });
  }

  async listProviderAccess(
    identity: AuthenticatedIdentity,
    membershipId: string,
  ): Promise<ProviderAccessResponseDto[]> {
    const membership = await this.repository.findMembership(
      this.repository.transactionClient,
      identity.tenantId,
      membershipId,
      false,
    );
    if (!membership) {
      throw new NotFoundException('Membership not found');
    }
    const assignments = await this.repository.listProviderAccess(identity.tenantId, membershipId);
    return assignments.map((assignment) => ({
      membershipId: assignment.membershipId,
      providerId: assignment.providerId,
      businessName: assignment.provider.businessName,
      providerType: assignment.provider.providerType,
      isActive: assignment.provider.isActive,
    }));
  }

  async addProviderAccess(
    identity: AuthenticatedIdentity,
    membershipId: string,
    providerId: string,
    request: RequestMetadata = {},
  ): Promise<ProviderAccessResponseDto> {
    return withSerializableRetry(this.repository.transactionClient, async (transaction) => {
      const [membership, provider] = await Promise.all([
        this.repository.findMembership(transaction, identity.tenantId, membershipId, true),
        this.repository.findProvider(transaction, identity.tenantId, providerId, true),
      ]);
      if (!membership || !provider) {
        throw new NotFoundException('Active membership or provider not found');
      }
      const existing = await this.repository.findProviderAccess(
        transaction,
        identity.tenantId,
        membershipId,
        providerId,
      );
      if (!existing) {
        const created = await this.repository.createProviderAccess(
          transaction,
          identity.tenantId,
          membershipId,
          providerId,
        );
        if (created.count === 1) {
          await this.auditWriter.appendTenantUser(transaction, {
            tenantId: identity.tenantId,
            actorMembershipId: identity.membershipId,
            eventType: 'authorization.provider-access.added',
            outcome: 'SUCCEEDED',
            resourceType: 'membership-provider-access',
            resourceId: `${membershipId}:${providerId}`,
            metadata: { targetMembershipId: membershipId, providerId },
            request,
          });
        }
      }
      return {
        membershipId,
        providerId,
        businessName: provider.businessName,
        providerType: provider.providerType,
        isActive: provider.isActive,
      };
    });
  }

  async removeProviderAccess(
    identity: AuthenticatedIdentity,
    membershipId: string,
    providerId: string,
    request: RequestMetadata = {},
  ): Promise<void> {
    await withSerializableRetry(this.repository.transactionClient, async (transaction) => {
      await this.repository.bumpTenantVersion(transaction, identity.tenantId);
      const [membership, provider, access] = await Promise.all([
        this.repository.findMembership(transaction, identity.tenantId, membershipId, false),
        this.repository.findProvider(transaction, identity.tenantId, providerId, false),
        this.repository.findProviderAccess(
          transaction,
          identity.tenantId,
          membershipId,
          providerId,
        ),
      ]);
      if (!membership || !provider || !access) {
        throw new NotFoundException('Provider assignment not found');
      }
      const removed = await this.repository.removeProviderAccess(
        transaction,
        identity.tenantId,
        membershipId,
        providerId,
      );
      if (removed.count !== 1) {
        throw new NotFoundException('Provider assignment not found');
      }
      await this.auditWriter.appendTenantUser(transaction, {
        tenantId: identity.tenantId,
        actorMembershipId: identity.membershipId,
        eventType: 'authorization.provider-access.removed',
        outcome: 'SUCCEEDED',
        resourceType: 'membership-provider-access',
        resourceId: `${membershipId}:${providerId}`,
        metadata: { targetMembershipId: membershipId, providerId },
        request,
      });
    });
  }

  private async requirePermissionCatalogue(
    transaction: Prisma.TransactionClient,
    keys: readonly PermissionKey[],
  ) {
    const permissions = await this.repository.findPermissions(transaction, keys);
    if (permissions.length !== new Set(keys).size) {
      throw new Error('Permission catalogue is incomplete');
    }
    return permissions;
  }

  private async requireMutableRole(
    transaction: Prisma.TransactionClient,
    tenantId: string,
    roleId: string,
  ) {
    const role = await this.repository.findRole(transaction, tenantId, roleId);
    if (!role) {
      throw new NotFoundException('Role not found');
    }
    if (role.type === 'SYSTEM') {
      throw new ForbiddenException('Built-in roles cannot be modified');
    }
    return role;
  }

  private mapRole(role: {
    id: string;
    name: string;
    description: string | null;
    type: 'SYSTEM' | 'TENANT';
    version: number;
    rolePermissions: Array<{ permission: { name: string } }>;
    _count: { roleAssignments: number };
  }): RoleResponseDto {
    return {
      id: role.id,
      name: role.name,
      description: role.description,
      type: role.type,
      version: role.version,
      permissionKeys: role.rolePermissions.map((mapping) => mapping.permission.name),
      assignmentCount: role._count.roleAssignments,
    };
  }
}
