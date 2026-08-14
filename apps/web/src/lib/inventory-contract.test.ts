import { describe, expect, it } from 'vitest';
import { validProviders, validStockPage } from '@/test/inventory-fixtures';
import {
  isBatchQuarantineRequest,
  isBatchQuarantineResponse,
  isDamagedStockRequest,
  isDamagedStockResponse,
  isInventoryStockPage,
  isProviderAccessList,
} from './inventory-contract';

describe('inventory boundary contracts', () => {
  it('accepts exact assigned-provider and stock responses', () => {
    expect(isProviderAccessList(validProviders)).toBe(true);
    expect(isInventoryStockPage(validStockPage)).toBe(true);
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
});
