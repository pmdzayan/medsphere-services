import type { AuditRequestContext } from '@medsphere/database';
import type { AuthenticatedIdentity } from '../auth/auth.types';

/**
 * Task 0034 - Patient medicine reservation contract.
 *
 * Patient ownership is derived EXCLUSIVELY from the authenticated global
 * identity (identity.userId). No client-supplied userId/patientId/
 * subjectUserId/tenantId/membershipId is ever accepted for
 * authorization or ownership.
 *
 * A reservation is created inside the PROVIDER's tenant (the provider is
 * resolved server-side and must be a verified, active provider eligible for
 * public service) using the shared MedicineReservation aggregate, the accepted
 * FEFO allocator, serializable transactions, and the accepted idempotency
 * receipt anchor for the same aggregate.
 */
export interface PatientReservationItemInput {
  readonly productId: string;
  readonly quantity: number;
}

/** Create command. tenantId and subjectUserId are server-derived. */
export interface CreatePatientReservationCommand {
  readonly identity: AuthenticatedIdentity;
  readonly providerId: string;
  readonly items: readonly PatientReservationItemInput[];
  readonly idempotencyKey: string;
  /** Optional client-supplied expiry; validated against the bounded policy. */
  readonly expiresAt?: Date;
  readonly request?: AuditRequestContext;
}

export interface PatientReservationCreationResult {
  readonly reservationId: string;
  readonly status: 'PENDING';
  readonly version: number;
  readonly itemCount: number;
  readonly totalQuantity: number;
  readonly expiresAt: Date;
  readonly replayed: boolean;
}

/** Patient-initiated cancellation command; scoped by identity.userId. */
export interface CancelPatientReservationCommand {
  readonly identity: AuthenticatedIdentity;
  readonly reservationId: string;
  readonly expectedVersion: number;
  readonly idempotencyKey: string;
  readonly request?: AuditRequestContext;
}

export interface PatientReservationCancellationResult {
  readonly reservationId: string;
  readonly status: 'CANCELLED';
  readonly version: number;
  readonly totalQuantity: number;
  readonly replayed: boolean;
}

/**
 * Patient-safe reservation projection. Never exposes batch identifiers,
 * allocation rows, held quantities, internal evidence, or provider
 * tenant identifiers.
 */
export interface PatientReservationProjection {
  readonly id: string;
  readonly status: 'PENDING' | 'CONFIRMED' | 'READY' | 'COMPLETED' | 'CANCELLED' | 'EXPIRED';
  readonly version: number;
  readonly expiresAt: Date;
  readonly createdAt: Date;
  readonly cancelledAt: Date | null;
  readonly expiredAt: Date | null;
  readonly providerId: string;
  readonly providerName: string;
  readonly providerCity: string;
  readonly providerState: string;
  readonly items: readonly PatientReservationItemProjection[];
  readonly totalQuantity: number;
}

export interface PatientReservationItemProjection {
  readonly productId: string;
  readonly name: string;
  readonly genericName: string | null;
  readonly brand: string;
  readonly strength: string;
  readonly dosageForm: string;
  readonly quantity: number;
}

export interface PatientReservationPage {
  readonly data: readonly PatientReservationProjection[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}
