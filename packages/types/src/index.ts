/**
 * Shared cross-service contracts only — no business logic lives here.
 * Deliberately minimal: real domain types (Patient, Pharmacy, InventoryItem,
 * Reservation, ...) belong to their own architecture-review pass per
 * PROJECT_RULES.md #8, not fabricated ahead of that design work.
 */

// Mirrors PROJECT_RULES.md #9's minimum role set for RBAC.
export enum Role {
  PATIENT = 'patient',
  PHARMACY_STAFF = 'pharmacy_staff',
  PHARMACY_ADMIN = 'pharmacy_admin',
  HOSPITAL_STAFF = 'hospital_staff',
  HOSPITAL_ADMIN = 'hospital_admin',
  SUPPLIER = 'supplier',
  PLATFORM_ADMIN = 'platform_admin',
}

export interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    requestId?: string;
  };
}

export type EventActorContext =
  | {
      readonly actorType: 'TENANT_USER';
      readonly tenantId: string;
      readonly membershipId: string;
      readonly userId: string;
    }
  | {
      readonly actorType: 'PLATFORM_USER';
      readonly userId: string;
      readonly tenantId?: never;
      readonly membershipId?: never;
    }
  | {
      readonly actorType: 'SYSTEM';
      readonly tenantId: string;
      readonly service: string;
      readonly userId?: never;
      readonly membershipId?: never;
    };

/**
 * Transport-neutral domain-event contract. Persistence, dispatch, retry, and
 * logging belong to infrastructure packages; this package exports no publisher.
 */
export interface DomainEventEnvelope<TPayload> {
  readonly eventId: string;
  readonly eventType: string;
  readonly eventVersion: number;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly occurredAt: string;
  readonly actor: EventActorContext;
  readonly correlationId?: string;
  readonly causationId?: string;
  readonly payload: TPayload;
}
