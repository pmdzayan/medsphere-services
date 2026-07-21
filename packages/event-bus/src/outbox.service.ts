import { OutboxRepository } from './outbox.repository';
import { DomainEventEnvelope, EventHandler } from './types';

/**
 * Framework-agnostic outbox event relay service.
 * Processes pending domain events from the transactional outbox table
 * and dispatches them to registered handlers.
 */
export class OutboxService {
  private readonly handlers = new Map<string, EventHandler[]>();

  constructor(private readonly repository: OutboxRepository) {}

  /**
   * Register a handler for a specific event type.
   */
  on(eventType: string, handler: EventHandler): void {
    const existing = this.handlers.get(eventType) ?? [];
    existing.push(handler);
    this.handlers.set(eventType, existing);
  }

  /**
   * Enqueue a domain event into the transactional outbox.
   */
  async enqueue<T>(event: DomainEventEnvelope<T>): Promise<void> {
    await this.repository.create({
      tenantId: event.tenantId,
      eventType: event.eventType,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      payload: event.payload as Record<string, unknown>,
      correlationId: event.correlationId,
    });
  }

  /**
   * Process pending outbox events: relay to registered handlers.
   * Called by a scheduled job/worker.
   */
  async processPending(batchSize = 50): Promise<number> {
    const pending = await this.repository.findPending(batchSize);
    let processed = 0;

    for (const event of pending) {
      const eventHandlers = this.handlers.get(event.eventType) ?? [];

      if (eventHandlers.length === 0) {
        await this.repository.markPublished(event.id);
        processed++;
        continue;
      }

      await this.repository.markProcessing(event.id);

      try {
        const envelope: DomainEventEnvelope = {
          eventType: event.eventType,
          aggregateType: event.aggregateType,
          aggregateId: event.aggregateId,
          payload: event.payload as Record<string, unknown>,
          correlationId: event.correlationId ?? undefined,
          tenantId: event.tenantId,
        };

        for (const handler of eventHandlers) {
          await handler(envelope);
        }

        await this.repository.markPublished(event.id);
        processed++;
      } catch (error) {
        const errorMessage = (error as Error).message;
        console.error(
          `[OutboxService] Failed to process event ${event.id} (${event.eventType}): ${errorMessage}`,
        );
        await this.repository.markFailed(event.id, errorMessage);
      }
    }

    return processed;
  }
}
