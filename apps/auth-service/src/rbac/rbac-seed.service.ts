import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { RbacRepository } from './rbac.repository';
import { Permissions, RolePermissions, parsePermission } from './permission.constants';

const DEFAULT_ROLES = [
  { name: 'Super Admin', type: 'SYSTEM' as const },
  { name: 'Patient', type: 'TENANT' as const },
  { name: 'Pharmacist', type: 'TENANT' as const },
  { name: 'Pharmacy Owner', type: 'TENANT' as const },
  { name: 'Doctor', type: 'TENANT' as const },
  { name: 'Hospital Admin', type: 'TENANT' as const },
  { name: 'Lab Staff', type: 'TENANT' as const },
  { name: 'Supplier', type: 'TENANT' as const },
  { name: 'Support Staff', type: 'TENANT' as const },
];

const PERMISSION_DEFINITIONS = Object.values(Permissions).map((perm) => {
  const { resource, action } = parsePermission(perm);
  return { resource, action, description: `${resource}:${action} permission` };
});

const SYSTEM_TENANT_ID = '00000000-0000-0000-0000-000000000000';

@Injectable()
export class RbacSeedService implements OnModuleInit {
  private readonly logger = new Logger(RbacSeedService.name);

  constructor(private readonly repository: RbacRepository) {}

  async onModuleInit() {
    await this.seed();
  }

  async seed() {
    try {
      // Check if permissions already exist
      const existingPermissions = await this.repository.findAllPermissions();
      if (existingPermissions.length > 0) {
        this.logger.log('Permissions already seeded, skipping...');
        return;
      }

      this.logger.log('Seeding default permissions...');
      const permissions: Array<{ id: string; resource: string; action: string }> = [];
      for (const perm of PERMISSION_DEFINITIONS) {
        const created = await this.repository.createPermission({
          resource: perm.resource,
          action: perm.action,
          description: perm.description,
        });
        permissions.push({ id: created.id, resource: created.resource, action: created.action });
      }

      this.logger.log('Seeding default roles...');
      const permissionKeyMap = new Map(permissions.map((p) => [`${p.resource}:${p.action}`, p.id]));

      // Create a system tenant for seeding (create if not exists?)
      // Roles are tenant-scoped, so we use the SYSTEM_TENANT_ID

      // Create default roles if they don't exist
      const existingRoles = await this.repository.findAllRoles(SYSTEM_TENANT_ID);
      const existingRoleNames = new Set(existingRoles.map((r: { name: string }) => r.name));

      for (const roleDef of DEFAULT_ROLES) {
        if (existingRoleNames.has(roleDef.name)) {
          this.logger.log(`Role "${roleDef.name}" already exists, skipping...`);
          continue;
        }

        const role = await this.repository.createRole({
          tenantId: SYSTEM_TENANT_ID,
          name: roleDef.name,
          type: roleDef.type,
        });

        const rolePermissionNames = RolePermissions[roleDef.name];
        if (rolePermissionNames && rolePermissionNames.length > 0) {
          const rolePermissionIds = rolePermissionNames
            .map((permName) => permissionKeyMap.get(permName as string))
            .filter((id): id is string => id !== undefined);
          if (rolePermissionIds.length > 0) {
            await this.repository.assignPermissionsToRole(role.id, rolePermissionIds);
          }
        }
      }

      this.logger.log('RBAC seed completed successfully');
    } catch (error) {
      this.logger.error('Failed to seed RBAC data', error);
    }
  }
}
