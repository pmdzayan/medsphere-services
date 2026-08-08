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

/**
 * Framework-independent event actor context used by every domain-event
 * envelope. System and service actors are represented explicitly and never
 * fabricated as fake users (ADR-0008).
 */
export interface EventActorContext {
  readonly actorType: 'TENANT_USER' | 'PLATFORM_USER' | 'SYSTEM' | 'SERVICE';
  readonly actorUserId?: string;
  readonly membershipId?: string;
}

/**
 * Versionable cross-service domain-event envelope contract. Framework- and
 * Prisma-independent; contains no token, password or credential fields and
 * never exposes complete internal database models (ADR-0008).
 */
export interface DomainEventEnvelope<TPayload = Record<string, unknown>> {
  readonly eventId: string;
  readonly eventName: string;
  readonly schemaVersion: number;
  readonly occurredAt: string;
  readonly tenantId: string;
  readonly correlationId?: string;
  readonly causationId?: string;
  readonly actorContext?: EventActorContext;
  readonly payload: TPayload;
}

export interface DomainEvent<TPayload = Record<string, unknown>> {
  readonly eventId: string;
  readonly eventName: string;
  readonly tenantId: string;
  readonly occurredAt: string;
  readonly payload: TPayload;
}

export interface DomainEventPublisher {
  publish<T extends DomainEvent>(event: T): Promise<void>;
}

export class BestEffortDomainEventPublisher implements DomainEventPublisher {
  private readonly handlers = new Map<
    string,
    Array<(event: DomainEvent<unknown>) => Promise<void>>
  >();

  subscribe<T extends DomainEvent>(eventName: string, handler: (event: T) => Promise<void>): void {
    const list = this.handlers.get(eventName) ?? [];
    list.push(handler as unknown as (event: DomainEvent<unknown>) => Promise<void>);
    this.handlers.set(eventName, list);
  }

  async publish<T extends DomainEvent>(event: T): Promise<void> {
    const handlers = this.handlers.get(event.eventName) ?? [];
    for (const handler of handlers) {
      try {
        await handler(event);
      } catch (error) {
        // Best-effort post-commit publishing log failure without throwing.
        console.error(
          `[BestEffortDomainEventPublisher] Non-durable event delivery failed for ${event.eventName} (${event.eventId})`,
          error,
        );
      }
    }
  }
}
