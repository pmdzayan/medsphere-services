import { describe, expect, it } from 'vitest';
import { validExpiryWorklistPage, validProviders, validStockPage } from '@/test/inventory-fixtures';
import {
  isBatchQuarantineRequest,
  isBatchQuarantineResponse,
  isCompletedTransferRequest,
  isCompletedTransferResponse,
  isDamagedStockRequest,
  isDamagedStockResponse,
  isInventoryStockPage,
  isInventoryExpiryWorklistPage,
  isProviderAccessList,
} from './inventory-contract';

describe('inventory boundary contracts', () => {
  it('accepts exact assigned-provider and stock responses', () => {
    expect(isProviderAccessList(validProviders)).toBe(true);
    expect(isInventoryStockPage(validStockPage)).toBe(true);
  });

  it('accepts only correlated, ordered expiry worklist responses', () => {
    expect(isInventoryExpiryWorklistPage(validExpiryWorklistPage)).toBe(true);
    expect(isInventoryExpiryWorklistPage({ ...validExpiryWorklistPage, tenantId: 'leak' })).toBe(
      false,
    );
    expect(
      isInventoryExpiryWorklistPage({
        ...validExpiryWorklistPage,
        data: [{ ...validExpiryWorklistPage.data[0], availableQuantity: 18 }],
      }),
    ).toBe(false);
    expect(isInventoryExpiryWorklistPage(validExpiryWorklistPage, 30)).toBe(true);
    expect(isInventoryExpiryWorklistPage(validExpiryWorklistPage, 7)).toBe(false);
    expect(
      isInventoryExpiryWorklistPage({
        ...validExpiryWorklistPage,
        data: [{ ...validExpiryWorklistPage.data[0], expiryDate: validExpiryWorklistPage.asOf }],
      }),
    ).toBe(false);
  });

  it('rejects over-broad and malformed provider responses', () => {
    expect(isProviderAccessList([{ ...validProviders[0], tenantId: 'untrusted' }])).toBe(false);
    expect(isProviderAccessList([{ ...validProviders[0], providerId: 'not-a-uuid' }])).toBe(false);
  });

  it('rejects inconsistent quantities, aggregates, pagination, and extra fields', () => {
    const item = validStockPage.data[0];
    expect(
      isInventoryStockPage({ ...validStockPage, data: [{ ...item, totalAvailableQuantity: 18 }] }),
    ).toBe(false);
    expect(
      isInventoryStockPage({
        ...validStockPage,
        data: [{ ...item, batches: [{ ...item.batches[0], availableQuantity: 18 }] }],
      }),
    ).toBe(false);
    expect(isInventoryStockPage({ ...validStockPage, total: 0 })).toBe(false);
    expect(isInventoryStockPage({ ...validStockPage, internal: 'leak' })).toBe(false);
  });

  it('accepts unavailable units excluded by expiry eligibility', () => {
    const item = validStockPage.data[0];
    expect(
      isInventoryStockPage({
        ...validStockPage,
        data: [
          {
            ...item,
            totalAvailableQuantity: 0,
            batches: [
              {
                ...item.batches[0],
                status: 'EXPIRED',
                availableQuantity: 0,
              },
            ],
          },
        ],
      }),
    ).toBe(true);
  });

  it('accepts quarantined physical stock only when availability is zero', () => {
    const item = validStockPage.data[0];
    const quarantined = {
      ...validStockPage,
      data: [
        {
          ...item,
          totalHeldQuantity: 0,
          totalAvailableQuantity: 0,
          batches: [
            {
              ...item.batches[0],
              status: 'QUARANTINED',
              heldQuantity: 0,
              availableQuantity: 0,
            },
          ],
        },
      ],
    } as const;
    expect(isInventoryStockPage(quarantined)).toBe(true);
    expect(
      isInventoryStockPage({
        ...quarantined,
        data: [
          {
            ...quarantined.data[0],
            totalAvailableQuantity: 1,
            batches: [{ ...quarantined.data[0].batches[0], availableQuantity: 1 }],
          },
        ],
      }),
    ).toBe(false);
  });

  it('accepts only the exact bounded quarantine command and receipt', () => {
    const request = {
      expectedVersion: 4,
      idempotencyKey: 'quarantine-command-1',
      reasonCode: 'QUALITY_SUSPECT',
    };
    const receipt = {
      batchId: validStockPage.data[0].batches[0].id,
      status: 'QUARANTINED',
      reasonCode: 'QUALITY_SUSPECT',
      onHandQuantity: 20,
      affectedReservationCount: 1,
      releasedUnitCount: 3,
      resultingBatchVersion: 5,
      occurredAt: '2026-08-14T01:00:00.000Z',
      replayed: false,
    };
    expect(isBatchQuarantineRequest(request)).toBe(true);
    expect(isBatchQuarantineRequest({ ...request, reason: 'free text' })).toBe(false);
    expect(isBatchQuarantineRequest({ ...request, expectedVersion: 0 })).toBe(false);
    expect(isBatchQuarantineResponse(receipt)).toBe(true);
    expect(isBatchQuarantineResponse({ ...receipt, tenantId: 'leak' })).toBe(false);
  });

  it('accepts only exact damaged-stock commands and conserving receipts', () => {
    const request = {
      expectedVersion: 4,
      quantity: 2,
      idempotencyKey: 'damage-command-1',
      reason: 'Two sealed packs were physically damaged during handling.',
    };
    const receipt = {
      providerId: validProviders[0].providerId,
      inventoryId: validStockPage.data[0].inventoryId,
      productId: validStockPage.data[0].productId,
      batchId: validStockPage.data[0].batches[0].id,
      movementId: '52f2d7a4-0948-49c4-a0a8-afbf88503a5c',
      quantity: 2,
      onHandBefore: 20,
      onHandAfter: 18,
      resultingBatchVersion: 5,
      occurredAt: '2026-08-14T02:00:00.000Z',
      replayed: false,
    };
    expect(isDamagedStockRequest(request)).toBe(true);
    expect(isDamagedStockRequest({ ...request, quantity: 0 })).toBe(false);
    expect(isDamagedStockRequest({ ...request, reason: ` ${request.reason}` })).toBe(false);
    expect(isDamagedStockRequest({ ...request, tenantId: 'attacker' })).toBe(false);
    expect(isDamagedStockResponse(receipt)).toBe(true);
    expect(isDamagedStockResponse({ ...receipt, onHandAfter: 19 })).toBe(false);
    expect(isDamagedStockResponse({ ...receipt, internal: true })).toBe(false);
  });

  it('accepts only exact completed-transfer commands and receipts', () => {
    const request = {
      destinationProviderId: '8b4d574f-48c6-4231-8851-e65edc9f9d42',
      sourceBatchId: validStockPage.data[0].batches[0].id,
      expectedSourceVersion: 4,
      quantity: 2,
      idempotencyKey: 'transfer-command-1',
      reason: 'Stock already moved between assigned locations.',
    };
    const receipt = {
      transferId: '52f2d7a4-0948-49c4-a0a8-afbf88503a5c',
      productId: validStockPage.data[0].productId,
      sourceProviderId: validProviders[0].providerId,
      destinationProviderId: request.destinationProviderId,
      sourceInventoryId: validStockPage.data[0].inventoryId,
      destinationInventoryId: 'd63f50dd-49b0-4a77-bc04-f7d00db58dd5',
      sourceBatchId: request.sourceBatchId,
      destinationBatchId: 'c3a97ec4-84f8-4a85-a493-b8d6feb84a27',
      sourceMovementId: 'a2f2d7a4-0948-49c4-a0a8-afbf88503a5c',
      destinationMovementId: 'b2f2d7a4-0948-49c4-a0a8-afbf88503a5c',
      quantity: 2,
      sourceOnHandAfter: 18,
      destinationOnHandAfter: 7,
      sourceBatchVersion: 5,
      destinationBatchVersion: 3,
      completedAt: '2026-08-14T04:00:00.000Z',
      replayed: false,
    };
    expect(isCompletedTransferRequest(request)).toBe(true);
    expect(isCompletedTransferRequest({ ...request, destinationInventoryId: 'leak' })).toBe(false);
    expect(isCompletedTransferRequest({ ...request, reason: ' ' })).toBe(false);
    expect(isCompletedTransferResponse(receipt)).toBe(true);
    expect(isCompletedTransferResponse({ ...receipt, tenantId: 'leak' })).toBe(false);
    expect(
      isCompletedTransferResponse({ ...receipt, destinationProviderId: receipt.sourceProviderId }),
    ).toBe(false);
  });
});
