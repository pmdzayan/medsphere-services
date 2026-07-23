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

  // Workflow (Gate 9)
  WORKFLOW_INSTANCE_CREATED: 'workflow.instance.created',
  WORKFLOW_INSTANCE_APPROVAL_REQUESTED: 'workflow.instance.approval_requested',
  WORKFLOW_INSTANCE_APPROVED: 'workflow.instance.approved',
  WORKFLOW_INSTANCE_REJECTED: 'workflow.instance.rejected',
  WORKFLOW_INSTANCE_COMPLETED: 'workflow.instance.completed',
  WORKFLOW_INSTANCE_CANCELLED: 'workflow.instance.cancelled',
  WORKFLOW_DEFINITION_CREATED: 'workflow.definition.created',
  WORKFLOW_DEFINITION_UPDATED: 'workflow.definition.updated',

  // Marketplace (Gate 10)
  MARKETPLACE_CART_CREATED: 'marketplace.cart.created',
  MARKETPLACE_CART_UPDATED: 'marketplace.cart.updated',
  MARKETPLACE_ORDER_CREATED: 'marketplace.order.created',
  MARKETPLACE_ORDER_CONFIRMED: 'marketplace.order.confirmed',
  MARKETPLACE_INVENTORY_RESERVED: 'marketplace.inventory.reserved',
  MARKETPLACE_PAYMENT_COMPLETED: 'marketplace.payment.completed',
  MARKETPLACE_DELIVERY_ASSIGNED: 'marketplace.delivery.assigned',
  MARKETPLACE_ORDER_COMPLETED: 'marketplace.order.completed',
} as const;
