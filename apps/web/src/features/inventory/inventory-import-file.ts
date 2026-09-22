import { readSheet, type CellValue } from 'read-excel-file/browser';

import {
  INVENTORY_IMPORT_FIELDS,
  type InventoryImportField,
  type InventoryImportStageRowRequest,
} from '@/lib/inventory-import-contract';

export const INVENTORY_IMPORT_MAX_BYTES = 5 * 1024 * 1024;
export const INVENTORY_IMPORT_MAX_ROWS = 500;
export const INVENTORY_IMPORT_MAX_COLUMNS = 64;
export const INVENTORY_IMPORT_ACCEPTED_TYPES = [
  'text/csv',
  'application/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '',
] as const;

export type ParsedInventoryImportFile = {
  sourceFormat: 'CSV' | 'XLSX';
  sourceFileName: string;
  contentHash: string;
  headers: string[];
  rows: string[][];
  suggestedMapping: Record<string, InventoryImportField>;
};

const HEADER_ALIASES: Readonly<Record<string, InventoryImportField>> = {
  productid: 'productId',
  medicineid: 'productId',
  identifier: 'identifier',
  barcode: 'identifier',
  gtin: 'identifier',
  ean: 'identifier',
  upc: 'identifier',
  productname: 'productName',
  medicinename: 'productName',
  medicine: 'productName',
  name: 'productName',
  brand: 'brand',
  brandname: 'brand',
  manufacturer: 'manufacturer',
  manufacturername: 'manufacturer',
  strength: 'strength',
  dosageform: 'dosageForm',
  form: 'dosageForm',
  sku: 'sku',
  stockkeepingunit: 'sku',
  sellingprice: 'sellingPrice',
  saleprice: 'sellingPrice',
  mrp: 'mrp',
  maximumretailprice: 'mrp',
  discount: 'discountPercentage',
  discountpercentage: 'discountPercentage',
  tax: 'taxPercentage',
  taxpercentage: 'taxPercentage',
  gst: 'taxPercentage',
  minimumstocklevel: 'minimumStockLevel',
  minstock: 'minimumStockLevel',
  reorderlevel: 'minimumStockLevel',
  visible: 'isVisible',
  isvisible: 'isVisible',
  batch: 'batchNumber',
  batchnumber: 'batchNumber',
  lot: 'batchNumber',
  lotnumber: 'batchNumber',
  manufacturingdate: 'manufacturingDate',
  manufacturedate: 'manufacturingDate',
  mfgdate: 'manufacturingDate',
  expirydate: 'expiryDate',
  expirationdate: 'expiryDate',
  expdate: 'expiryDate',
  quantity: 'quantity',
  qty: 'quantity',
  stock: 'quantity',
  purchaseprice: 'purchasePrice',
  costprice: 'purchasePrice',
  buyingprice: 'purchasePrice',
};

export async function parseInventoryImportFile(file: File): Promise<ParsedInventoryImportFile> {
  if (file.size <= 0 || file.size > INVENTORY_IMPORT_MAX_BYTES) {
    throw new Error('inventory-import-file-size');
  }

  const sourceFormat = sourceFormatForFile(file.name);
  const buffer = await file.arrayBuffer();
  const contentHash = await sha256Hex(buffer);
  const data =
    sourceFormat === 'CSV'
      ? parseCsv(new TextDecoder('utf-8', { fatal: true }).decode(buffer))
      : await readSheet(file);

  if (data.length < 2) throw new Error('inventory-import-empty');
  if (data.length - 1 > INVENTORY_IMPORT_MAX_ROWS)
    throw new Error('inventory-import-too-many-rows');
  if (data.some((row) => row.length > INVENTORY_IMPORT_MAX_COLUMNS)) {
    throw new Error('inventory-import-too-many-columns');
  }

  const headers = normalizeHeaders(data[0]);
  const rows = data.slice(1).map((row) => normalizeDataRow(row, headers.length));
  if (rows.every((row) => row.every((cell) => cell === ''))) {
    throw new Error('inventory-import-empty');
  }

  return {
    sourceFormat,
    sourceFileName: file.name,
    contentHash,
    headers,
    rows,
    suggestedMapping: suggestInventoryImportMapping(headers),
  };
}

export function suggestInventoryImportMapping(
  headers: readonly string[],
): Record<string, InventoryImportField> {
  const mapping: Record<string, InventoryImportField> = {};
  const usedTargets = new Set<InventoryImportField>();

  for (const header of headers) {
    const target = HEADER_ALIASES[canonicalHeader(header)];
    if (!target || usedTargets.has(target)) continue;
    mapping[header] = target;
    usedTargets.add(target);
  }
  return mapping;
}

export function buildInventoryImportRows(
  parsed: Pick<ParsedInventoryImportFile, 'headers' | 'rows'>,
  mapping: Readonly<Record<string, InventoryImportField>>,
): InventoryImportStageRowRequest[] {
  assertMapping(parsed.headers, mapping);
  const indexByHeader = new Map(parsed.headers.map((header, index) => [header, index]));

  return parsed.rows
    .map((row, dataIndex) => {
      const result: InventoryImportStageRowRequest = { rowNumber: dataIndex + 2 };
      for (const [header, target] of Object.entries(mapping)) {
        const index = indexByHeader.get(header);
        if (index === undefined) continue;
        const value = row[index]?.trim() ?? '';
        if (value) result[target] = value;
      }
      return result;
    })
    .filter((row) => Object.keys(row).length > 1);
}

export function assertMapping(
  headers: readonly string[],
  mapping: Readonly<Record<string, InventoryImportField>>,
): void {
  const headerSet = new Set(headers);
  const targets = new Set<string>();
  const entries = Object.entries(mapping);
  if (entries.length < 1 || entries.length > 32) throw new Error('inventory-import-mapping');

  for (const [header, target] of entries) {
    if (
      !headerSet.has(header) ||
      !INVENTORY_IMPORT_FIELDS.includes(target) ||
      targets.has(target)
    ) {
      throw new Error('inventory-import-mapping');
    }
    targets.add(target);
  }

  const hasReference =
    targets.has('productId') || targets.has('identifier') || targets.has('productName');
  if (!hasReference) throw new Error('inventory-import-product-reference');
  for (const required of [
    'sellingPrice',
    'mrp',
    'batchNumber',
    'expiryDate',
    'quantity',
    'purchasePrice',
  ]) {
    if (!targets.has(required)) throw new Error('inventory-import-required-mapping');
  }
}

function sourceFormatForFile(name: string): 'CSV' | 'XLSX' {
  const lower = name.trim().toLowerCase();
  if (lower.endsWith('.csv')) return 'CSV';
  if (lower.endsWith('.xlsx')) return 'XLSX';
  throw new Error('inventory-import-file-type');
}

function normalizeHeaders(row: readonly CellValue[]): string[] {
  const headers = row.map((cell) => cellToString(cell).trim());
  if (headers.length < 1 || headers.length > INVENTORY_IMPORT_MAX_COLUMNS) {
    throw new Error('inventory-import-headers');
  }
  if (headers.some((header) => !header || header.length > 120)) {
    throw new Error('inventory-import-headers');
  }
  if (new Set(headers.map((header) => header.toLocaleLowerCase())).size !== headers.length) {
    throw new Error('inventory-import-duplicate-headers');
  }
  return headers;
}

function normalizeDataRow(row: readonly CellValue[], width: number): string[] {
  return Array.from({ length: width }, (_, index) => cellToString(row[index] ?? null));
}

function cellToString(cell: CellValue): string {
  if (cell === null || cell === undefined) return '';
  if (cell instanceof Date) return cell.toISOString();
  if (typeof cell === 'boolean') return cell ? 'true' : 'false';
  return String(cell);
}

function canonicalHeader(value: string): string {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, '');
}

function parseCsv(source: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"') {
        if (source[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += character;
      }
      continue;
    }

    if (character === '"' && cell.length === 0) {
      quoted = true;
    } else if (character === ',') {
      row.push(cell);
      cell = '';
    } else if (character === '\n') {
      row.push(cell.endsWith('\r') ? cell.slice(0, -1) : cell);
      rows.push(row);
      row = [];
      cell = '';
      if (rows.length > INVENTORY_IMPORT_MAX_ROWS + 1) {
        throw new Error('inventory-import-too-many-rows');
      }
    } else {
      cell += character;
    }
  }

  if (quoted) throw new Error('inventory-import-csv-quote');
  row.push(cell.endsWith('\r') ? cell.slice(0, -1) : cell);
  if (row.some((value) => value !== '') || rows.length === 0) rows.push(row);
  return rows;
}

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
