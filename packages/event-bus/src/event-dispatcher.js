"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DomainEvents = exports.OutboxStatus = exports.OutboxService = exports.OutboxRepository = void 0;
const outbox_repository_1 = require("./outbox.repository");
Object.defineProperty(exports, "OutboxRepository", { enumerable: true, get: function () { return outbox_repository_1.OutboxRepository; } });
const outbox_service_1 = require("./outbox.service");
Object.defineProperty(exports, "OutboxService", { enumerable: true, get: function () { return outbox_service_1.OutboxService; } });
const types_1 = require("./types");
Object.defineProperty(exports, "OutboxStatus", { enumerable: true, get: function () { return types_1.OutboxStatus; } });
exports.DomainEvents = {
    PRESCRIPTION_SUBMITTED: 'clinical.prescription.submitted',
    ENCOUNTER_COMPLETED: 'clinical.encounter.completed',
    STOCK_RESERVATION_CREATED: 'inventory.reservation.created',
    STOCK_RESERVATION_FULFILLED: 'inventory.reservation.fulfilled',
    STOCK_BATCH_LOW: 'inventory.batch.low',
    INVOICE_ISSUED: 'finance.invoice.issued',
    INVOICE_PAID: 'finance.invoice.paid',
    CLAIM_SUBMITTED: 'finance.claim.submitted',
    CLAIM_ADJUDICATED: 'finance.claim.adjudicated',
    PATIENT_CREATED: 'patient.created',
    PATIENT_MERGED: 'patient.merged',
    WORKFLOW_INSTANCE_CREATED: 'workflow.instance.created',
    WORKFLOW_INSTANCE_APPROVAL_REQUESTED: 'workflow.instance.approval_requested',
    WORKFLOW_INSTANCE_APPROVED: 'workflow.instance.approved',
    WORKFLOW_INSTANCE_REJECTED: 'workflow.instance.rejected',
    WORKFLOW_INSTANCE_COMPLETED: 'workflow.instance.completed',
    WORKFLOW_INSTANCE_CANCELLED: 'workflow.instance.cancelled',
    WORKFLOW_DEFINITION_CREATED: 'workflow.definition.created',
    WORKFLOW_DEFINITION_UPDATED: 'workflow.definition.updated',
    MARKETPLACE_CART_CREATED: 'marketplace.cart.created',
    MARKETPLACE_CART_UPDATED: 'marketplace.cart.updated',
    MARKETPLACE_ORDER_CREATED: 'marketplace.order.created',
    MARKETPLACE_ORDER_CONFIRMED: 'marketplace.order.confirmed',
    MARKETPLACE_INVENTORY_RESERVED: 'marketplace.inventory.reserved',
    MARKETPLACE_PAYMENT_COMPLETED: 'marketplace.payment.completed',
    MARKETPLACE_DELIVERY_ASSIGNED: 'marketplace.delivery.assigned',
    MARKETPLACE_ORDER_COMPLETED: 'marketplace.order.completed',
};
//# sourceMappingURL=event-dispatcher.js.map