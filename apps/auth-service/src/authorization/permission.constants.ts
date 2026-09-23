export const PERMISSIONS = {
  rolesRead: 'authorization.roles.read',
  rolesCreate: 'authorization.roles.create',
  rolesUpdate: 'authorization.roles.update',
  rolesDelete: 'authorization.roles.delete',
  permissionsRead: 'authorization.permissions.read',
  assignmentsRead: 'authorization.assignments.read',
  assignmentsManage: 'authorization.assignments.manage',
  providerAccessRead: 'authorization.provider-access.read',
  providerAccessManage: 'authorization.provider-access.manage',
  organizationJoinCodesManage: 'organization.join-codes.manage',
  membershipsManage: 'authorization.memberships.manage',
  auditEventsRead: 'audit.events.read',
  inventoryStockRead: 'inventory.stock.read',
  inventoryListingsManage: 'inventory.listings.manage',
  inventoryStockReceive: 'inventory.stock.receive',
  inventoryStockAdjust: 'inventory.stock.adjust',
  inventoryStockTransfer: 'inventory.stock.transfer',
  inventoryStockDamage: 'inventory.stock.damage',
  inventoryBatchQuarantine: 'inventory.batch.quarantine',
  /** Task 0044: inventory exception closure. */
  inventoryBatchRecall: 'inventory.batch.recall',
  inventoryExceptionRequest: 'inventory.exception.request',
  inventoryExceptionApprove: 'inventory.exception.approve',
  inventoryReservationsRead: 'inventory.reservations.read',
  inventoryReservationsCreate: 'inventory.reservations.create',
  inventoryReservationsManage: 'inventory.reservations.manage',
  inventoryAvailabilityRequestsRead: 'inventory.availability-requests.read',
  inventoryAvailabilityRequestsManage: 'inventory.availability-requests.manage',
  inventoryAvailabilityRequestsConfigure: 'inventory.availability-requests.configure',
  /** Task 0039: pharmacy onboarding/verification submission by tenant staff. */
  providerOnboardingManage: 'provider.onboarding.manage',
  /** Task 0043: pharmacy POS and fiscal boundaries. */
  billingPosRead: 'billing.pos.read',
  billingPosCheckout: 'billing.pos.checkout',
  billingPosConfigure: 'billing.pos.configure',
  billingPosVoid: 'billing.pos.void',
  billingPosReturn: 'billing.pos.return',
} as const;

export const PERMISSION_KEYS = Object.values(PERMISSIONS);
export type PermissionKey = (typeof PERMISSION_KEYS)[number];

const PERMISSION_KEY_SET = new Set<string>(PERMISSION_KEYS);

export function isPermissionKey(value: string): value is PermissionKey {
  return PERMISSION_KEY_SET.has(value);
}

export const TENANT_ADMINISTRATOR_ROLE = 'TENANT_ADMINISTRATOR';
