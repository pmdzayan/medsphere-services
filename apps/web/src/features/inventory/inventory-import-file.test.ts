import { describe, expect, it } from 'vitest';

import {
  assertMapping,
  buildInventoryImportRows,
  parseInventoryImportFile,
  suggestInventoryImportMapping,
} from './inventory-import-file';

describe('Task 0042 inventory import file boundary', () => {
  it('suggests unique canonical AIM fields from common pharmacy headers', () => {
    expect(
      suggestInventoryImportMapping([
        'Barcode',
        'Medicine Name',
        'Batch Number',
        'Expiry Date',
        'Qty',
        'Purchase Price',
        'MRP',
        'Selling Price',
      ]),
    ).toEqual({
      Barcode: 'identifier',
      'Medicine Name': 'productName',
      'Batch Number': 'batchNumber',
      'Expiry Date': 'expiryDate',
      Qty: 'quantity',
      'Purchase Price': 'purchasePrice',
      MRP: 'mrp',
      'Selling Price': 'sellingPrice',
    });
  });

  it('builds bounded canonical row commands without carrying ignored columns', () => {
    const parsed = {
      headers: ['Barcode', 'Name', 'Batch', 'Expiry', 'Qty', 'Buy', 'MRP', 'Sale', 'Internal Note'],
      rows: [
        [
          '4006381333931',
          'Medicine A',
          'B-1',
          '2028-01-01',
          '10',
          '5.00',
          '8.00',
          '7.50',
          'ignore me',
        ],
      ],
    };
    const mapping = {
      Barcode: 'identifier',
      Name: 'productName',
      Batch: 'batchNumber',
      Expiry: 'expiryDate',
      Qty: 'quantity',
      Buy: 'purchasePrice',
      MRP: 'mrp',
      Sale: 'sellingPrice',
    } as const;

    expect(buildInventoryImportRows(parsed, mapping)).toEqual([
      {
        rowNumber: 2,
        identifier: '4006381333931',
        productName: 'Medicine A',
        batchNumber: 'B-1',
        expiryDate: '2028-01-01',
        quantity: '10',
        purchasePrice: '5.00',
        mrp: '8.00',
        sellingPrice: '7.50',
      },
    ]);
  });

  it('rejects mappings without exact product reference or stock-critical columns', () => {
    expect(() =>
      assertMapping(['Batch', 'Qty'], { Batch: 'batchNumber', Qty: 'quantity' }),
    ).toThrow();
    expect(() =>
      assertMapping(['Barcode', 'Batch', 'Expiry', 'Qty', 'Buy', 'MRP'], {
        Barcode: 'identifier',
        Batch: 'batchNumber',
        Expiry: 'expiryDate',
        Qty: 'quantity',
        Buy: 'purchasePrice',
        MRP: 'mrp',
      }),
    ).toThrow();
  });

  it('parses quoted CSV safely and records SHA-256 evidence before staging', async () => {
    const file = new File(
      [
        [
          'Barcode,Medicine Name,Batch Number,Expiry Date,Qty,Purchase Price,MRP,Selling Price',
          '4006381333931,"Paracetamol, 500 mg",B-1,2028-01-01,10,5.00,8.00,7.50',
        ].join('\n'),
      ],
      'inventory.csv',
      { type: 'text/csv' },
    );

    const parsed = await parseInventoryImportFile(file);
    expect(parsed.sourceFormat).toBe('CSV');
    expect(parsed.sourceFileName).toBe('inventory.csv');
    expect(parsed.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0][1]).toBe('Paracetamol, 500 mg');
  });
});
