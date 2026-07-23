import { OutboxRepository } from './outbox.repository';
import { DomainEventEnvelope, EventHandler } from './types';
export declare class OutboxService {
    private readonly repository;
    private readonly handlers;
    constructor(repository: OutboxRepository);
    on(eventType: string, handler: EventHandler): void;
    enqueue<T>(event: DomainEventEnvelope<T>): Promise<void>;
    processPending(batchSize?: number): Promise<number>;
}
