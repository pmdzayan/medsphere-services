"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OutboxService = void 0;
class OutboxService {
    repository;
    handlers = new Map();
    constructor(repository) {
        this.repository = repository;
    }
    on(eventType, handler) {
        const existing = this.handlers.get(eventType) ?? [];
        existing.push(handler);
        this.handlers.set(eventType, existing);
    }
    async enqueue(event) {
        await this.repository.create({
            tenantId: event.tenantId,
            eventType: event.eventType,
            aggregateType: event.aggregateType,
            aggregateId: event.aggregateId,
            payload: event.payload,
            correlationId: event.correlationId,
        });
    }
    async processPending(batchSize = 50) {
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
                const envelope = {
                    eventType: event.eventType,
                    aggregateType: event.aggregateType,
                    aggregateId: event.aggregateId,
                    payload: event.payload,
                    correlationId: event.correlationId ?? undefined,
                    tenantId: event.tenantId,
                };
                for (const handler of eventHandlers) {
                    await handler(envelope);
                }
                await this.repository.markPublished(event.id);
                processed++;
            }
            catch (error) {
                const errorMessage = error.message;
                console.error(`[OutboxService] Failed to process event ${event.id} (${event.eventType}): ${errorMessage}`);
                await this.repository.markFailed(event.id, errorMessage);
            }
        }
        return processed;
    }
}
exports.OutboxService = OutboxService;
//# sourceMappingURL=outbox.service.js.map