import type { AuditRequestContext } from '@medsphere/database';
import type { TrustedTenantActor } from '@medsphere/security';

export type PosActor = TrustedTenantActor;

export interface ConfigurePharmacyFiscalProfileCommand {
  readonly actor: PosActor;
  readonly providerId: string;
  readonly registrationType: 'GST_REGULAR' | 'GST_COMPOSITION' | 'UNREGISTERED';
  readonly legalName: string;
  readonly gstin?: string;
  readonly stateCode: string;
  readonly invoiceSeries: string;
  readonly pricesIncludeTax: boolean;
  readonly expectedVersion?: number;
  readonly request?: AuditRequestContext;
}

export interface ConfigureInventoryFiscalProfileCommand {
  readonly actor: PosActor;
  readonly providerId: string;
  readonly inventoryId: string;
  readonly hsnCode: string;
  readonly uqc: string;
  readonly cessPercentage: string;
  readonly expectedVersion?: number;
  readonly request?: AuditRequestContext;
}

export interface PharmacyCheckoutCommand {
  readonly actor: PosActor;
  readonly providerId: string;
  readonly idempotencyKey: string;
  readonly lines: readonly { readonly productId: string; readonly quantity: number }[];
  readonly payments: readonly {
    readonly method: 'CASH' | 'CARD' | 'UPI' | 'OTHER';
    readonly amount: string;
    readonly externalReference?: string;
  }[];
  readonly reservationId?: string;
  readonly placeOfSupplyStateCode: string;
  readonly recipientName?: string;
  readonly recipientAddress?: string;
  readonly recipientGstin?: string;
  readonly cashTendered?: string;
  readonly request?: AuditRequestContext;
}

export interface VoidPharmacySaleCommand {
  readonly actor: PosActor;
  readonly providerId: string;
  readonly saleId: string;
  readonly idempotencyKey: string;
  readonly reason: string;
  readonly request?: AuditRequestContext;
}
