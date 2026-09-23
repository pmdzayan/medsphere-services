import { describe, expect, it } from 'vitest';
import {
  isBatchRecallResponse,
  isInventoryExceptionDecisionRequest,
  isInventoryExceptionDecisionResponse,
  isInventoryExceptionRequest,
  isInventoryExceptionRequestResponse,
  isRecallBatchRequest,
} from './inventory-exception-contract';
import { isPosReturnReceipt, isPosReturnRequest } from './pos-return-contract';

const PROVIDER_ID = '11111111-1111-4111-8111-111111111111';
const BATCH_ID = '22222222-2222-4222-8222-222222222222';
const SALE_ID = '33333333-3333-4333-8333-333333333333';
const LINE_ID = '44444444-4444-4444-8444-444444444444';
const RETURN_ID = '55555555-5555-4555-8555-555555555555';
const REQUEST_ID = '66666666-6666-4666-8666-666666666666';
const DECISION_ID = '77777777-7777-4777-8777-777777777777';
const MOVEMENT_ID = '88888888-8888-4888-8888-888888888888';

describe('Task 0044 strict web contracts', () => {
  it('accepts only exact bounded POS return commands', () => {
    const valid = {
      idempotencyKey: 'return-12345678',
      reasonCode: 'CUSTOMER_REQUEST',
      reason: 'Customer brought back unopened package',
      refundMethod: 'CASH',
      lines: [{ saleLineId: LINE_ID, quantity: 1 }],
    };
    expect(isPosReturnRequest(valid)).toBe(true);
    expect(isPosReturnRequest({ ...valid, tenantId: PROVIDER_ID })).toBe(false);
    expect(isPosReturnRequest({ ...valid, lines: [{ saleLineId: 'garbage', quantity: 1 }] })).toBe(
      false,
    );
    expect(isPosReturnRequest({ ...valid, lines: [{ saleLineId: LINE_ID, quantity: 0 }] })).toBe(
      false,
    );
    expect(
      isPosReturnRequest({
        ...valid,
        lines: [
          { saleLineId: LINE_ID, quantity: 1 },
          { saleLineId: LINE_ID, quantity: 1 },
        ],
      }),
    ).toBe(false);
  });

  it('fails closed on POS return response drift', () => {
    const receipt = {
      returnId: RETURN_ID,
      saleId: SALE_ID,
      providerId: PROVIDER_ID,
      reasonCode: 'CUSTOMER_REQUEST',
      refundMethod: 'CASH',
      refundExternalReference: null,
      lineCount: 1,
      totalQuantity: 1,
      subtotal: '10.00',
      discountTotal: '0.00',
      taxableTotal: '9.52',
      cgstTotal: '0.24',
      sgstTotal: '0.24',
      igstTotal: '0.00',
      cessTotal: '0.00',
      refundTotal: '10.00',
      occurredAt: '2026-09-23T12:00:00.000Z',
      replayed: false,
    };
    expect(isPosReturnReceipt(receipt)).toBe(true);
    expect(isPosReturnReceipt({ ...receipt, actorUserId: PROVIDER_ID })).toBe(false);
    expect(isPosReturnReceipt({ ...receipt, refundTotal: '-1.00' })).toBe(false);
  });

  it('requires exact recall commands and responses', () => {
    const command = {
      expectedVersion: 3,
      idempotencyKey: 'recall-12345678',
      reasonCode: 'MANUFACTURER_RECALL',
      reason: 'Manufacturer recall notice',
    };
    expect(isRecallBatchRequest(command)).toBe(true);
    expect(isRecallBatchRequest({ ...command, expectedVersion: 0 })).toBe(false);
    expect(isRecallBatchRequest({ ...command, extra: true })).toBe(false);

    const receipt = {
      batchId: BATCH_ID,
      status: 'RECALLED',
      reasonCode: 'MANUFACTURER_RECALL',
      onHandQuantity: 5,
      affectedReservationCount: 1,
      releasedUnitCount: 2,
      resultingBatchVersion: 4,
      occurredAt: '2026-09-23T12:00:00.000Z',
      replayed: false,
    };
    expect(isBatchRecallResponse(receipt)).toBe(true);
    expect(isBatchRecallResponse({ ...receipt, status: 'ACTIVE' })).toBe(false);
  });

  it('enforces action-specific inventory exception request shape', () => {
    const release = {
      batchId: BATCH_ID,
      expectedVersion: 4,
      action: 'QUARANTINE_RELEASE',
      idempotencyKey: 'exception-release-1234',
      reason: 'Quality review completed',
    };
    expect(isInventoryExceptionRequest(release)).toBe(true);
    expect(isInventoryExceptionRequest({ ...release, quantity: 1 })).toBe(false);

    const disposal = {
      ...release,
      action: 'DISPOSAL',
      quantity: 2,
      idempotencyKey: 'exception-disposal-1234',
    };
    expect(isInventoryExceptionRequest(disposal)).toBe(true);
    expect(isInventoryExceptionRequest({ ...disposal, quantity: 0 })).toBe(false);
    expect(isInventoryExceptionRequest({ ...disposal, actorUserId: PROVIDER_ID })).toBe(false);
  });

  it('fails closed on exception request response drift', () => {
    const receipt = {
      requestId: REQUEST_ID,
      providerId: PROVIDER_ID,
      batchId: BATCH_ID,
      action: 'DISPOSAL',
      quantity: 2,
      requestedBatchVersion: 4,
      requestedAt: '2026-09-23T12:00:00.000Z',
      replayed: false,
    };
    expect(isInventoryExceptionRequestResponse(receipt)).toBe(true);
    expect(isInventoryExceptionRequestResponse({ ...receipt, quantity: null })).toBe(false);
    expect(isInventoryExceptionRequestResponse({ ...receipt, tenantId: PROVIDER_ID })).toBe(false);
  });

  it('requires exact decision commands and action-consistent receipts', () => {
    const command = {
      outcome: 'APPROVED',
      idempotencyKey: 'decision-12345678',
      reason: 'Second operator verified physical stock',
    };
    expect(isInventoryExceptionDecisionRequest(command)).toBe(true);
    expect(isInventoryExceptionDecisionRequest({ ...command, requestId: REQUEST_ID })).toBe(false);

    const approved = {
      decisionId: DECISION_ID,
      requestId: REQUEST_ID,
      providerId: PROVIDER_ID,
      batchId: BATCH_ID,
      action: 'DISPOSAL',
      quantity: 2,
      outcome: 'APPROVED',
      movementId: MOVEMENT_ID,
      onHandBefore: 5,
      onHandAfter: 3,
      resultingBatchVersion: 5,
      occurredAt: '2026-09-23T12:00:00.000Z',
      replayed: false,
    };
    expect(isInventoryExceptionDecisionResponse(approved)).toBe(true);
    expect(
      isInventoryExceptionDecisionResponse({
        ...approved,
        movementId: null,
      }),
    ).toBe(false);

    const rejected = {
      ...approved,
      outcome: 'REJECTED',
      movementId: null,
      onHandBefore: null,
      onHandAfter: null,
      resultingBatchVersion: null,
    };
    expect(isInventoryExceptionDecisionResponse(rejected)).toBe(true);
    expect(isInventoryExceptionDecisionResponse({ ...rejected, onHandBefore: 5 })).toBe(false);
  });
});
