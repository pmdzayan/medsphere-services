import type { AuditRequestContext } from '@medsphere/database';
import type { PosActor } from './pos.types';

export const PHARMACY_RETURN_REASONS = [
  'CUSTOMER_REQUEST',
  'WRONG_ITEM',
  'DAMAGED_PACKAGE',
  'PRODUCT_DEFECT',
  'OTHER',
] as const;

export type PharmacyReturnReason = (typeof PHARMACY_RETURN_REASONS)[number];

export interface ReturnPharmacySaleCommand {
  readonly actor: PosActor;
  readonly providerId: string;
  readonly saleId: string;
  readonly idempotencyKey: string;
  readonly reasonCode: PharmacyReturnReason;
  readonly reason: string;
  readonly refundMethod: 'CASH' | 'CARD' | 'UPI' | 'OTHER';
  readonly refundExternalReference?: string;
  readonly lines: readonly {
    readonly saleLineId: string;
    readonly quantity: number;
  }[];
  readonly request?: AuditRequestContext;
}

export interface PharmacySaleReturnReceipt {
  readonly returnId: string;
  readonly saleId: string;
  readonly providerId: string;
  readonly reasonCode: PharmacyReturnReason;
  readonly refundMethod: 'CASH' | 'CARD' | 'UPI' | 'OTHER';
  readonly refundExternalReference: string | null;
  readonly lineCount: number;
  readonly totalQuantity: number;
  readonly subtotal: string;
  readonly discountTotal: string;
  readonly taxableTotal: string;
  readonly cgstTotal: string;
  readonly sgstTotal: string;
  readonly igstTotal: string;
  readonly cessTotal: string;
  readonly refundTotal: string;
  readonly occurredAt: Date;
  readonly replayed: boolean;
}
