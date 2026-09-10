/**
 * Task 0026 - Live Availability Request & Pharmacist Confirmation contract.
 *
 * One typed contract for the provider/product-level live availability
 * workflow introduced on top of the Task 0025 canonical trust foundation:
 *
 *   patient sees uncertain medicine availability
 *   -> patient asks the pharmacy to check
 *   -> one live request reaches the provider's operational queue
 *   -> an authorized pharmacist responds AVAILABLE / UNAVAILABLE / CHECK_LATER
 *   -> the patient sees a recent pharmacy-confirmed result
 *   -> the confirmation expires automatically after its bounded validity
 *
 * Privacy invariant: no patient medical data, contact information, or
 * free-form patient text exists anywhere in this contract. A request is only
 * "please confirm whether this provider currently has this product".
 *
 * Quantity invariant (Task 0025): pharmacist evidence is provider/product
 * level and append-only. It never becomes a Batch quantity, never writes a
 * BatchStockObservation, and never creates a StockMovement. Batch remains the
 * sole quantity authority.
 */
import type { TrustedInventoryActor } from './inventory-command.types';

export const AVAILABILITY_REQUEST_STATES = ['PENDING', 'RESPONDED', 'EXPIRED'] as const;

export type AvailabilityRequestState = (typeof AVAILABILITY_REQUEST_STATES)[number];

/**
 * Closed clinical-copy-free outcome catalogue an authorized responder may
 * submit. CHECK_LATER carries a bounded server-validated retry delay and is
 * never presented to a patient as current availability.
 */
export const PHARMACIST_CONFIRMATION_OUTCOMES = [
  'AVAILABLE',
  'UNAVAILABLE',
  'CHECK_LATER',
] as const;

export type PharmacistConfirmationOutcome = (typeof PHARMACIST_CONFIRMATION_OUTCOMES)[number];

/** Closed catalogue of provider/product-level live evidence sources. */
export const PROVIDER_PRODUCT_EVIDENCE_SOURCES = ['PHARMACIST_CONFIRMATION'] as const;

export type ProviderProductEvidenceSource = (typeof PROVIDER_PRODUCT_EVIDENCE_SOURCES)[number];

/**
 * Public patient-facing availability states. These are the ONLY states the
 * public surface may render; internal quantities, batches, inventory ids,
 * staff identities and audit ids are never part of this contract.
 */
export const PUBLIC_AVAILABILITY_STATES = [
  'AVAILABLE',
  'UNAVAILABLE',
  'CONFIRMATION_REQUIRED',
  'UNKNOWN',
] as const;

export type PublicAvailabilityState = (typeof PUBLIC_AVAILABILITY_STATES)[number];

/**
 * Coarse confirmation source exposed publicly. Never includes staff/member
 * identity, batch or tenant detail.
 */
export const PUBLIC_CONFIRMATION_SOURCES = ['PHARMACY_CONFIRMED'] as const;

export type PublicConfirmationSource = (typeof PUBLIC_CONFIRMATION_SOURCES)[number];

/**
 * Minimized public resolution for one provider/product. Safe fields only:
 * no tenant, inventory, batch, quantity, staff/member identity, audit id, or
 * cost. `requestId` is null when no request exists (e.g. a current
 * pharmacist confirmation already answered the question).
 */
export interface PublicAvailabilityResolution {
  readonly requestId: string | null;
  readonly requestStatus: 'NONE' | AvailabilityRequestState;
  readonly requestedAt: Date | null;
  readonly expiresAt: Date | null;
  readonly respondedAt: Date | null;
  readonly availabilityState: PublicAvailabilityState;
  readonly confirmationSource: PublicConfirmationSource | null;
  readonly confirmedAt: Date | null;
  readonly retryAfterAt: Date | null;
}

/** Public create input: only opaque provider/product references. No body
 * fields are accepted; everything else is server-derived. */
export interface CreateAvailabilityRequestInput {
  readonly providerId: string;
  readonly productId: string;
}

/** Operational pharmacist response command. All identity/tenant/provider
 *  context comes from the trusted actor and path parameters, never the body. */
export interface RespondAvailabilityRequestCommand {
  readonly actor: TrustedInventoryActor;
  readonly providerId: string;
  readonly requestId: string;
  readonly outcome: PharmacistConfirmationOutcome;
  readonly idempotencyKey: string;
  readonly retryAfterMinutes?: number;
  readonly expectedVersion: number;
}

export interface AvailabilityResponseResult {
  readonly requestId: string;
  readonly outcome: PharmacistConfirmationOutcome;
  readonly confirmedAt: Date;
  readonly validUntil: Date | null;
  readonly retryAfterAt: Date | null;
  readonly replayed: boolean;
}

/** One queue row shown to an assigned staff member. Operational, patient-free. */
export interface AvailabilityRequestQueueRow {
  readonly requestId: string;
  readonly productId: string;
  readonly productName: string;
  readonly genericName: string | null;
  readonly brand: string;
  readonly strength: string;
  readonly dosageForm: string;
  readonly status: AvailabilityRequestState;
  readonly requestedAt: Date;
  readonly expiresAt: Date;
  readonly version: number;
}
