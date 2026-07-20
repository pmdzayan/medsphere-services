import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { RbacRepository } from './rbac.repository';
import { Permissions, RolePermissions } from './permission.constants';

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

const PERMISSION_DEFINITIONS = Object.values(Permissions).map((name) => ({
  name,
  description: `${name} permission`,
}));

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
      // Check if roles already exist
      const existingRoles = await this.repository.findAllRoles();
      if (existingRoles.length > 0) {
        this.logger.log('Roles already seeded, skipping...');
        return;
      }

      this.logger.log('Seeding default permissions...');
      const permissions: Array<{ id: string; name: string }> = [];
      for (const perm of PERMISSION_DEFINITIONS) {
        const created = await this.repository.createPermission({
          tenantId: SYSTEM_TENANT_ID,
          name: perm.name,
          description: perm.description,
        });
        permissions.push({ id: created.id, name: created.name });
      }

      this.logger.log('Seeding default roles...');
      const permissionMap = new Map(permissions.map((p) => [p.name, p.id]));

      for (const roleDef of DEFAULT_ROLES) {
        const role = await this.repository.createRole({
          tenantId: SYSTEM_TENANT_ID,
          name: roleDef.name,
          type: roleDef.type,
        });

        const rolePermissionNames = RolePermissions[roleDef.name];
        if (rolePermissionNames && rolePermissionNames.length > 0) {
          const rolePermissionIds = rolePermissionNames
            .map((name) => permissionMap.get(name))
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
