import type { AuditRequestContext } from '@medsphere/database';
import type { TrustedInventoryActor } from './inventory-command.types';

export interface ReservationCreationItem {
  readonly productId: string;
  readonly quantity: number;
}

export interface CreateProviderReservationCommand {
  readonly actor: TrustedInventoryActor;
  readonly providerId: string;
  readonly subjectUserId: string;
  readonly expiresAt: Date;
  readonly items: readonly ReservationCreationItem[];
  readonly idempotencyKey: string;
  readonly request?: AuditRequestContext;
}

export interface ProviderReservationCreationResult {
  readonly reservationId: string;
  readonly status: 'PENDING';
  readonly version: number;
  readonly itemCount: number;
  readonly totalQuantity: number;
  readonly replayed: boolean;
}
