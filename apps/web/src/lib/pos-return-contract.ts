import { isCanonicalUuid } from './inventory-contract';

export const POS_RETURN_REASONS = [
  'CUSTOMER_REQUEST',
  'WRONG_ITEM',
  'DAMAGED_PACKAGE',
  'PRODUCT_DEFECT',
  'OTHER',
] as const;
export type PosReturnReason = (typeof POS_RETURN_REASONS)[number];

export const POS_RETURN_PAYMENT_METHODS = ['CASH', 'CARD', 'UPI', 'OTHER'] as const;
export type PosReturnPaymentMethod = (typeof POS_RETURN_PAYMENT_METHODS)[number];

export interface PosReturnRequest {
  idempotencyKey: string;
  reasonCode: PosReturnReason;
  reason: string;
  refundMethod: PosReturnPaymentMethod;
  refundExternalReference?: string;
  lines: { saleLineId: string; quantity: number }[];
}

export interface PosReturnReceipt {
  returnId: string;
  saleId: string;
  providerId: string;
  reasonCode: PosReturnReason;
  refundMethod: PosReturnPaymentMethod;
  refundExternalReference: string | null;
  lineCount: number;
  totalQuantity: number;
  subtotal: string;
  discountTotal: string;
  taxableTotal: string;
  cgstTotal: string;
  sgstTotal: string;
  igstTotal: string;
  cessTotal: string;
  refundTotal: string;
  occurredAt: string;
  replayed: boolean;
}

export function isPosReturnRequest(value: unknown): value is PosReturnRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<PosReturnRequest>;
  const keys = Object.keys(value).sort();
  const allowed = [
    'idempotencyKey',
    'lines',
    'reason',
    'reasonCode',
    'refundExternalReference',
    'refundMethod',
  ];
  if (!keys.every((key) => allowed.includes(key))) return false;
  if (
    !['idempotencyKey', 'lines', 'reason', 'reasonCode', 'refundMethod'].every((key) =>
      keys.includes(key),
    )
  ) {
    return false;
  }
  return (
    trimmed(candidate.idempotencyKey, 8, 120) &&
    POS_RETURN_REASONS.includes(candidate.reasonCode as PosReturnReason) &&
    trimmed(candidate.reason, 1, 500) &&
    POS_RETURN_PAYMENT_METHODS.includes(candidate.refundMethod as PosReturnPaymentMethod) &&
    (candidate.refundExternalReference === undefined ||
      trimmed(candidate.refundExternalReference, 1, 80)) &&
    Array.isArray(candidate.lines) &&
    candidate.lines.length >= 1 &&
    candidate.lines.length <= 100 &&
    candidate.lines.every((line) => {
      if (!line || typeof line !== 'object' || Array.isArray(line)) return false;
      const item = line as { saleLineId?: unknown; quantity?: unknown };
      return (
        Object.keys(line).sort().join(',') === 'quantity,saleLineId' &&
        isCanonicalUuid(item.saleLineId) &&
        integer(item.quantity, 1, 2_147_483_647)
      );
    }) &&
    new Set(candidate.lines.map((line) => line.saleLineId)).size === candidate.lines.length
  );
}

export function isPosReturnReceipt(value: unknown): value is PosReturnReceipt {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Partial<PosReturnReceipt>;
  const expected = [
    'returnId',
    'saleId',
    'providerId',
    'reasonCode',
    'refundMethod',
    'refundExternalReference',
    'lineCount',
    'totalQuantity',
    'subtotal',
    'discountTotal',
    'taxableTotal',
    'cgstTotal',
    'sgstTotal',
    'igstTotal',
    'cessTotal',
    'refundTotal',
    'occurredAt',
    'replayed',
  ].sort();
  const actual = Object.keys(value).sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index]) &&
    isCanonicalUuid(v.returnId) &&
    isCanonicalUuid(v.saleId) &&
    isCanonicalUuid(v.providerId) &&
    POS_RETURN_REASONS.includes(v.reasonCode as PosReturnReason) &&
    POS_RETURN_PAYMENT_METHODS.includes(v.refundMethod as PosReturnPaymentMethod) &&
    (v.refundExternalReference === null || trimmed(v.refundExternalReference, 1, 80)) &&
    integer(v.lineCount, 1, 100) &&
    integer(v.totalQuantity, 1, 2_147_483_647) &&
    money(v.subtotal) &&
    money(v.discountTotal) &&
    money(v.taxableTotal) &&
    money(v.cgstTotal) &&
    money(v.sgstTotal) &&
    money(v.igstTotal) &&
    money(v.cessTotal) &&
    money(v.refundTotal) &&
    Number(v.refundTotal) > 0 &&
    iso(v.occurredAt) &&
    typeof v.replayed === 'boolean'
  );
}

function trimmed(value: unknown, min: number, max: number): value is string {
  return (
    typeof value === 'string' &&
    value === value.trim() &&
    value.length >= min &&
    value.length <= max
  );
}
function integer(value: unknown, min: number, max: number): value is number {
  return Number.isSafeInteger(value) && Number(value) >= min && Number(value) <= max;
}
function money(value: unknown): value is string {
  return typeof value === 'string' && /^(?:0|[1-9]\d{0,9})\.\d{2}$/.test(value);
}
function iso(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}
