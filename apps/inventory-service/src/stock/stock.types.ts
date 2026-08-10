export interface TrustedTenantActor {
  readonly tenantId: string;
  readonly membershipId: string;
}

export interface FefoCandidate {
  readonly id: string;
  readonly inventoryId: string;
  readonly expiryDate: Date;
  readonly manufacturingDate: Date | null;
  readonly onHandQuantity: number;
  readonly heldQuantity: number;
  readonly version?: number;
  readonly status: 'ACTIVE' | 'EXPIRED' | 'EXHAUSTED' | 'QUARANTINED';
  readonly createdAt: Date;
  readonly deletedAt: Date | null;
}

export interface FefoAllocation {
  readonly batchId: string;
  readonly inventoryId: string;
  readonly quantity: number;
}
