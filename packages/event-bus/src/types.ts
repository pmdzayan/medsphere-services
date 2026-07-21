export enum OutboxStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  PUBLISHED = 'PUBLISHED',
  FAILED = 'FAILED',
}

export interface DomainEventEnvelope<T = Record<string, unknown>> {
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: T;
  correlationId?: string;
  tenantId: string;
}

export type EventHandler<T = Record<string, unknown>> = (
  event: DomainEventEnvelope<T>,
) => Promise<void>;

export const EVENT_HANDLER_METADATA = 'event_bus:handlers';
