import { describe, expect, it } from 'vitest';

import {
  isApplyInventoryImportRequest,
  isInventoryCatalogResponse,
  isInventoryImportApplyReceipt,
  isInventoryImportPreview,
  isStageInventoryImportRequest,
} from './inventory-import-contract';

const uuid = (suffix: string) => `10000000-0000-4000-8000-${suffix.padStart(12, '0')}`;

describe('Task 0042 inventory import BFF contracts', () => {
  const stage = {
    sourceFormat: 'CSV',
    sourceFileName: 'inventory.csv',
    contentHash: 'a'.repeat(64),
    stageIdempotencyKey: 'inventory-stage-1',
    mapping: {
      Barcode: 'identifier',
      Batch: 'batchNumber',
      Expiry: 'expiryDate',
      Qty: 'quantity',
      Buy: 'purchasePrice',
      MRP: 'mrp',
      Sale: 'sellingPrice',
    },
    rows: [
      {
        rowNumber: 2,
        identifier: '4006381333931',
        batchNumber: 'B-1',
        expiryDate: '2028-01-01',
        quantity: '10',
        purchasePrice: '5.00',
        mrp: '8.00',
        sellingPrice: '7.50',
      },
    ],
  } as const;

  it('accepts exact staging requests and rejects ownership/tenant injection', () => {
    expect(isStageInventoryImportRequest(stage)).toBe(true);
    expect(isStageInventoryImportRequest({ ...stage, tenantId: uuid('9') })).toBe(false);
    expect(
      isStageInventoryImportRequest({
        ...stage,
        rows: [{ ...stage.rows[0], providerId: uuid('8') }],
      }),
    ).toBe(false);
  });

  it('rejects duplicate mapped targets and more than 500 rows', () => {
    expect(
      isStageInventoryImportRequest({
        ...stage,
        mapping: { Barcode: 'identifier', GTIN: 'identifier' },
      }),
    ).toBe(false);
    expect(
      isStageInventoryImportRequest({
        ...stage,
        rows: Array.from({ length: 501 }, (_, index) => ({
          ...stage.rows[0],
          rowNumber: index + 2,
        })),
      }),
    ).toBe(false);
  });

  it('accepts exact catalogue and preview responses while rejecting internal fields', () => {
    const catalog = {
      mode: 'IDENTIFIER',
      canonicalIdentifier: '04006381333931',
      data: [
        {
          id: uuid('1'),
          name: 'Medicine A',
          genericName: 'Generic',
          brand: 'Brand',
          manufacturer: 'Manufacturer',
          dosageForm: 'Tablet',
          strength: '500 mg',
          barcode: '4006381333931',
          requiresPrescription: false,
          identifiers: [
            {
              type: 'EAN',
              value: '4006381333931',
              normalizedValue: '04006381333931',
              isPrimary: true,
            },
          ],
        },
      ],
    };
    expect(isInventoryCatalogResponse(catalog)).toBe(true);
    expect(isInventoryCatalogResponse({ ...catalog, tenantId: uuid('2') })).toBe(false);

    const preview = {
      importJobId: uuid('3'),
      providerId: uuid('4'),
      sourceFormat: 'CSV',
      sourceFileName: 'inventory.csv',
      status: 'STAGED',
      rowCount: 1,
      validRowCount: 1,
      invalidRowCount: 0,
      createdAt: '2026-09-22T10:00:00.000Z',
      appliedAt: null,
      replayed: false,
      receipt: null,
      rows: [
        {
          rowId: uuid('5'),
          rowNumber: 2,
          productId: uuid('1'),
          payload: {
            sku: null,
            sellingPrice: '7.50',
            mrp: '8.00',
            discountPercentage: '0.00',
            taxPercentage: '0.00',
            minimumStockLevel: 0,
            isVisible: true,
            batchNumber: 'B-1',
            manufacturingDate: null,
            expiryDate: '2028-01-01T00:00:00.000Z',
            quantity: 10,
            purchasePrice: '5.00',
            expectedInventoryVersion: null,
          },
          validationErrors: [],
          status: 'VALID',
          inventoryId: null,
          batchId: null,
        },
      ],
    };
    expect(isInventoryImportPreview(preview)).toBe(true);
    expect(isInventoryImportPreview({ ...preview, stagedByMembershipId: uuid('6') })).toBe(false);
  });

  it('accepts only exact apply commands and conserving public receipts', () => {
    expect(isApplyInventoryImportRequest({ idempotencyKey: 'apply-1' })).toBe(true);
    expect(
      isApplyInventoryImportRequest({ idempotencyKey: 'apply-1', actorMembershipId: uuid('7') }),
    ).toBe(false);
    expect(
      isInventoryImportApplyReceipt({
        receiptId: uuid('8'),
        appliedRowCount: 2,
        totalQuantity: 17,
        replayed: false,
      }),
    ).toBe(true);
    expect(
      isInventoryImportApplyReceipt({
        receiptId: uuid('8'),
        appliedRowCount: 2,
        totalQuantity: 0,
        replayed: false,
      }),
    ).toBe(false);
  });
});
