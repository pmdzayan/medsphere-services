import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { RbacRepository } from './rbac.repository';

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

const PERMISSION_DEFINITIONS = [
  // Inventory permissions
  { name: 'inventory:create', description: 'Create inventory records' },
  { name: 'inventory:read', description: 'View inventory records' },
  { name: 'inventory:update', description: 'Update inventory records' },
  { name: 'inventory:delete', description: 'Delete inventory records' },
  // Reservation permissions
  { name: 'reservation:create', description: 'Create reservations' },
  { name: 'reservation:read', description: 'View reservations' },
  { name: 'reservation:update', description: 'Update reservations' },
  { name: 'reservation:delete', description: 'Delete reservations' },
  { name: 'reservation:approve', description: 'Approve reservations' },
  // User permissions
  { name: 'users:create', description: 'Create users' },
  { name: 'users:read', description: 'View users' },
  { name: 'users:update', description: 'Update users' },
  { name: 'users:delete', description: 'Delete users' },
  // Pharmacy permissions
  { name: 'pharmacy:create', description: 'Create pharmacy records' },
  { name: 'pharmacy:read', description: 'View pharmacy records' },
  { name: 'pharmacy:update', description: 'Update pharmacy records' },
  { name: 'pharmacy:delete', description: 'Delete pharmacy records' },
  { name: 'pharmacy:approve', description: 'Approve pharmacy operations' },
  // Hospital permissions
  { name: 'hospital:create', description: 'Create hospital records' },
  { name: 'hospital:read', description: 'View hospital records' },
  { name: 'hospital:update', description: 'Update hospital records' },
  { name: 'hospital:delete', description: 'Delete hospital records' },
  // Lab permissions
  { name: 'lab:create', description: 'Create lab records' },
  { name: 'lab:read', description: 'View lab records' },
  { name: 'lab:update', description: 'Update lab records' },
  { name: 'lab:delete', description: 'Delete lab records' },
  // Doctor permissions
  { name: 'doctor:create', description: 'Create doctor records' },
  { name: 'doctor:read', description: 'View doctor records' },
  { name: 'doctor:update', description: 'Update doctor records' },
  { name: 'doctor:delete', description: 'Delete doctor records' },
  // Supplier permissions
  { name: 'supplier:create', description: 'Create supplier records' },
  { name: 'supplier:read', description: 'View supplier records' },
  { name: 'supplier:update', description: 'Update supplier records' },
  { name: 'supplier:delete', description: 'Delete supplier records' },
  // Report permissions
  { name: 'reports:read', description: 'View reports' },
  { name: 'reports:export', description: 'Export reports' },
  // Admin permissions
  { name: 'admin:create', description: 'Admin create operations' },
  { name: 'admin:read', description: 'Admin read operations' },
  { name: 'admin:update', description: 'Admin update operations' },
  { name: 'admin:delete', description: 'Admin delete operations' },
  { name: 'admin:approve', description: 'Admin approve operations' },
  { name: 'admin:export', description: 'Admin export operations' },
  // Audit log permissions
  { name: 'audit:read', description: 'View audit logs' },
  { name: 'audit:export', description: 'Export audit logs' },
];

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

        // Assign permissions based on role
        const rolePermissionIds = this.getPermissionsForRole(roleDef.name, permissionMap);
        if (rolePermissionIds.length > 0) {
          await this.repository.assignPermissionsToRole(role.id, rolePermissionIds);
        }
      }

      this.logger.log('RBAC seed completed successfully');
    } catch (error) {
      this.logger.error('Failed to seed RBAC data', error);
    }
  }

  private getPermissionsForRole(roleName: string, permissionMap: Map<string, string>): string[] {
    const allPermissionNames = Array.from(permissionMap.keys());

    switch (roleName) {
      case 'Super Admin':
        // Super Admin gets all permissions
        return allPermissionNames.map((name) => permissionMap.get(name)!).filter(Boolean);

      case 'Pharmacy Owner':
        return allPermissionNames
          .filter(
            (name) =>
              name.startsWith('inventory:') ||
              name.startsWith('users:') ||
              name.startsWith('pharmacy:') ||
              name.startsWith('reports:') ||
              name === 'admin:read' ||
              name === 'audit:read' ||
              name === 'reservation:read' ||
              name === 'reservation:approve' ||
              name.startsWith('supplier:'),
          )
          .map((name) => permissionMap.get(name)!)
          .filter(Boolean);

      case 'Hospital Admin':
        return allPermissionNames
          .filter(
            (name) =>
              name.startsWith('hospital:') ||
              name.startsWith('users:') ||
              name.startsWith('reports:') ||
              name === 'admin:read' ||
              name === 'audit:read',
          )
          .map((name) => permissionMap.get(name)!)
          .filter(Boolean);

      case 'Pharmacist':
        return allPermissionNames
          .filter(
            (name) =>
              name.startsWith('inventory:') ||
              name === 'reservation:read' ||
              name === 'reservation:update' ||
              name === 'users:read',
          )
          .map((name) => permissionMap.get(name)!)
          .filter(Boolean);

      case 'Doctor':
        return allPermissionNames
          .filter(
            (name) =>
              name.startsWith('doctor:') ||
              name === 'reservation:read' ||
              name === 'reservation:create' ||
              name === 'users:read',
          )
          .map((name) => permissionMap.get(name)!)
          .filter(Boolean);

      case 'Lab Staff':
        return allPermissionNames
          .filter(
            (name) =>
              name.startsWith('lab:') || name === 'reservation:read' || name === 'users:read',
          )
          .map((name) => permissionMap.get(name)!)
          .filter(Boolean);

      case 'Patient':
        return allPermissionNames
          .filter(
            (name) =>
              name === 'reservation:create' ||
              name === 'reservation:read' ||
              name === 'users:read' ||
              name === 'users:update',
          )
          .map((name) => permissionMap.get(name)!)
          .filter(Boolean);

      case 'Supplier':
        return allPermissionNames
          .filter(
            (name) =>
              name.startsWith('supplier:') || name === 'inventory:read' || name === 'users:read',
          )
          .map((name) => permissionMap.get(name)!)
          .filter(Boolean);

      case 'Support Staff':
        return allPermissionNames
          .filter(
            (name) =>
              name === 'users:read' ||
              name === 'users:update' ||
              name === 'reservation:read' ||
              name === 'reservation:update',
          )
          .map((name) => permissionMap.get(name)!)
          .filter(Boolean);

      default:
        return [];
    }
  }
}
