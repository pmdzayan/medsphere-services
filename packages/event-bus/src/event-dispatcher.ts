import { OutboxRepository } from './outbox.repository';
import { OutboxService } from './outbox.service';
import { OutboxStatus, DomainEventEnvelope } from './types';

export { OutboxRepository, OutboxService, OutboxStatus };
export type { DomainEventEnvelope };

/**
 * Predefined domain event types for the MedSphere platform.
 */
export const DomainEvents = {
  // Clinical
  PRESCRIPTION_SUBMITTED: 'clinical.prescription.submitted',
  ENCOUNTER_COMPLETED: 'clinical.encounter.completed',

  // Inventory
  STOCK_RESERVATION_CREATED: 'inventory.reservation.created',
  STOCK_RESERVATION_FULFILLED: 'inventory.reservation.fulfilled',
  STOCK_BATCH_LOW: 'inventory.batch.low',

  // Finance
  INVOICE_ISSUED: 'finance.invoice.issued',
  INVOICE_PAID: 'finance.invoice.paid',
  CLAIM_SUBMITTED: 'finance.claim.submitted',
  CLAIM_ADJUDICATED: 'finance.claim.adjudicated',

  // Patient
  PATIENT_CREATED: 'patient.created',
  PATIENT_MERGED: 'patient.merged',
} as const;
