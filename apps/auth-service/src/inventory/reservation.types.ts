import type { AuditRequestContext } from '@medsphere/database';
import type { TrustedInventoryActor } from './inventory-command.types';

export type ProviderReservationTransition = 'CONFIRM' | 'READY' | 'COMPLETE' | 'CANCEL';

export type ProviderReservationResultStatus = 'CONFIRMED' | 'READY' | 'COMPLETED' | 'CANCELLED';

export interface TransitionProviderReservationCommand {
  readonly actor: TrustedInventoryActor;
  readonly reservationId: string;
  readonly providerId: string;
  readonly transition: ProviderReservationTransition;
  readonly expectedVersion: number;
  readonly idempotencyKey: string;
  readonly request?: AuditRequestContext;
}

export interface ProviderReservationTransitionResult {
  readonly reservationId: string;
  readonly status: ProviderReservationResultStatus;
  readonly version: number;
  readonly totalQuantity: number;
  readonly replayed: boolean;
}
