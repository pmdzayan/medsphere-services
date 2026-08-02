import type { AuditRequestContext } from '@medsphere/database';
import type { TrustedTenantActor } from '../stock/stock.types';

export interface MedicineReservationItemInput {
  readonly productId: string;
  readonly quantity: number;
}

export interface CreateMedicineReservationCommand {
  readonly actor: TrustedTenantActor;
  readonly providerId: string;
  readonly subjectUserId: string;
  readonly expiresAt: Date;
  readonly items: readonly MedicineReservationItemInput[];
  readonly notes?: string;
  readonly idempotencyKey: string;
  readonly request?: AuditRequestContext;
}

export interface MedicineReservationResult {
  readonly reservationId: string;
  readonly status: 'PENDING';
  readonly version: number;
  readonly itemCount: number;
  readonly totalQuantity: number;
  readonly replayed: boolean;
}
