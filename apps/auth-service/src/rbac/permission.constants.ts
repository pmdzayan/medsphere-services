/**
 * Centralized permission constants for tenant-scoped authorization.
 *
 * Each permission is defined as a `{ resource, action }` tuple expressed
 * in the format `<resource>:<action>`.
 *
 * Resources group related domain operations. Actions follow standard CRUD
 * plus domain-specific verbs (approve, export, assign).
 *
 * This module is safe for use in decorators, guards, and seed scripts.
 */

export const Permissions = {
  // Inventory
  INVENTORY_CREATE: 'inventory:create' as const,
  INVENTORY_READ: 'inventory:read' as const,
  INVENTORY_UPDATE: 'inventory:update' as const,
  INVENTORY_DELETE: 'inventory:delete' as const,

  // Reservation
  RESERVATION_CREATE: 'reservation:create' as const,
  RESERVATION_READ: 'reservation:read' as const,
  RESERVATION_UPDATE: 'reservation:update' as const,
  RESERVATION_DELETE: 'reservation:delete' as const,
  RESERVATION_APPROVE: 'reservation:approve' as const,

  // User management
  USERS_CREATE: 'users:create' as const,
  USERS_READ: 'users:read' as const,
  USERS_UPDATE: 'users:update' as const,
  USERS_DELETE: 'users:delete' as const,

  // Pharmacy
  PHARMACY_CREATE: 'pharmacy:create' as const,
  PHARMACY_READ: 'pharmacy:read' as const,
  PHARMACY_UPDATE: 'pharmacy:update' as const,
  PHARMACY_DELETE: 'pharmacy:delete' as const,
  PHARMACY_APPROVE: 'pharmacy:approve' as const,

  // Hospital
  HOSPITAL_CREATE: 'hospital:create' as const,
  HOSPITAL_READ: 'hospital:read' as const,
  HOSPITAL_UPDATE: 'hospital:update' as const,
  HOSPITAL_DELETE: 'hospital:delete' as const,

  // Lab
  LAB_CREATE: 'lab:create' as const,
  LAB_READ: 'lab:read' as const,
  LAB_UPDATE: 'lab:update' as const,
  LAB_DELETE: 'lab:delete' as const,

  // Doctor
  DOCTOR_CREATE: 'doctor:create' as const,
  DOCTOR_READ: 'doctor:read' as const,
  DOCTOR_UPDATE: 'doctor:update' as const,
  DOCTOR_DELETE: 'doctor:delete' as const,

  // Supplier
  SUPPLIER_CREATE: 'supplier:create' as const,
  SUPPLIER_READ: 'supplier:read' as const,
  SUPPLIER_UPDATE: 'supplier:update' as const,
  SUPPLIER_DELETE: 'supplier:delete' as const,

  // Reports
  REPORTS_READ: 'reports:read' as const,
  REPORTS_EXPORT: 'reports:export' as const,

  // Admin
  ADMIN_CREATE: 'admin:create' as const,
  ADMIN_READ: 'admin:read' as const,
  ADMIN_UPDATE: 'admin:update' as const,
  ADMIN_DELETE: 'admin:delete' as const,
  ADMIN_APPROVE: 'admin:approve' as const,
  ADMIN_EXPORT: 'admin:export' as const,

  // Audit
  AUDIT_READ: 'audit:read' as const,
  AUDIT_EXPORT: 'audit:export' as const,

  // MPI (Master Patient Index)
  MPI_CREATE: 'mpi:create' as const,
  MPI_READ: 'mpi:read' as const,
  MPI_UPDATE: 'mpi:update' as const,
  MPI_DELETE: 'mpi:delete' as const,
  MPI_MERGE: 'mpi:merge' as const,
} as const;

export type Permission = (typeof Permissions)[keyof typeof Permissions];

/**
 * Splits a "<resource>:<action>" string into its components.
 */
export function parsePermission(permission: string): { resource: string; action: string } {
  const [resource, action] = permission.split(':');
  return {
    resource: resource ?? '*',
    action: action ?? '*',
  };
}

/**
 * Predefined role definitions mapping role names to their granted permissions.
 */
export const RolePermissions: Record<string, readonly Permission[]> = {
  'Super Admin': Object.values(Permissions),

  'Pharmacy Owner': [
    Permissions.INVENTORY_CREATE,
    Permissions.INVENTORY_READ,
    Permissions.INVENTORY_UPDATE,
    Permissions.INVENTORY_DELETE,
    Permissions.USERS_CREATE,
    Permissions.USERS_READ,
    Permissions.USERS_UPDATE,
    Permissions.USERS_DELETE,
    Permissions.PHARMACY_CREATE,
    Permissions.PHARMACY_READ,
    Permissions.PHARMACY_UPDATE,
    Permissions.PHARMACY_DELETE,
    Permissions.REPORTS_READ,
    Permissions.REPORTS_EXPORT,
    Permissions.ADMIN_READ,
    Permissions.AUDIT_READ,
    Permissions.RESERVATION_READ,
    Permissions.RESERVATION_APPROVE,
    Permissions.SUPPLIER_CREATE,
    Permissions.SUPPLIER_READ,
    Permissions.SUPPLIER_UPDATE,
    Permissions.SUPPLIER_DELETE,
  ],

  'Hospital Admin': [
    Permissions.HOSPITAL_CREATE,
    Permissions.HOSPITAL_READ,
    Permissions.HOSPITAL_UPDATE,
    Permissions.HOSPITAL_DELETE,
    Permissions.USERS_CREATE,
    Permissions.USERS_READ,
    Permissions.USERS_UPDATE,
    Permissions.USERS_DELETE,
    Permissions.REPORTS_READ,
    Permissions.REPORTS_EXPORT,
    Permissions.ADMIN_READ,
    Permissions.AUDIT_READ,
  ],

  Pharmacist: [
    Permissions.INVENTORY_CREATE,
    Permissions.INVENTORY_READ,
    Permissions.INVENTORY_UPDATE,
    Permissions.RESERVATION_READ,
    Permissions.RESERVATION_UPDATE,
    Permissions.USERS_READ,
  ],

  Doctor: [
    Permissions.DOCTOR_CREATE,
    Permissions.DOCTOR_READ,
    Permissions.DOCTOR_UPDATE,
    Permissions.DOCTOR_DELETE,
    Permissions.RESERVATION_READ,
    Permissions.RESERVATION_CREATE,
    Permissions.USERS_READ,
  ],

  'Lab Staff': [
    Permissions.LAB_CREATE,
    Permissions.LAB_READ,
    Permissions.LAB_UPDATE,
    Permissions.LAB_DELETE,
    Permissions.RESERVATION_READ,
    Permissions.USERS_READ,
  ],

  Patient: [
    Permissions.RESERVATION_CREATE,
    Permissions.RESERVATION_READ,
    Permissions.USERS_READ,
    Permissions.USERS_UPDATE,
  ],

  Supplier: [
    Permissions.SUPPLIER_CREATE,
    Permissions.SUPPLIER_READ,
    Permissions.SUPPLIER_UPDATE,
    Permissions.SUPPLIER_DELETE,
    Permissions.INVENTORY_READ,
    Permissions.USERS_READ,
  ],

  'Support Staff': [
    Permissions.USERS_READ,
    Permissions.USERS_UPDATE,
    Permissions.RESERVATION_READ,
    Permissions.RESERVATION_UPDATE,
  ],

  // MPI roles get all MPI permissions
  'Registration Clerk': [Permissions.MPI_CREATE, Permissions.MPI_READ, Permissions.MPI_UPDATE],

  'MPI Administrator': [
    Permissions.MPI_CREATE,
    Permissions.MPI_READ,
    Permissions.MPI_UPDATE,
    Permissions.MPI_DELETE,
    Permissions.MPI_MERGE,
  ],
} as const;
