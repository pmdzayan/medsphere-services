"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OutboxRepository = void 0;
const database_1 = require("@medsphere/database");
const types_1 = require("./types");
class OutboxRepository {
    prisma = (0, database_1.getPrismaClient)();
    async create(data) {
        return this.prisma.outboxEvent.create({
            data: {
                tenantId: data.tenantId,
                eventType: data.eventType,
                aggregateType: data.aggregateType,
                aggregateId: data.aggregateId,
                payload: data.payload,
                correlationId: data.correlationId,
            },
        });
    }
    async findPending(batchSize = 50) {
        return this.prisma.outboxEvent.findMany({
            where: {
                status: types_1.OutboxStatus.PENDING,
                scheduledFor: { lte: new Date() },
            },
            orderBy: { createdAt: 'asc' },
            take: batchSize,
        });
    }
    async markProcessing(id) {
        return this.prisma.outboxEvent.update({
            where: { id },
            data: { status: types_1.OutboxStatus.PROCESSING },
        });
    }
    async markPublished(id) {
        return this.prisma.outboxEvent.update({
            where: { id },
            data: { status: types_1.OutboxStatus.PUBLISHED, publishedAt: new Date() },
        });
    }
    async markFailed(id, error) {
        return this.prisma.outboxEvent.update({
            where: { id },
            data: {
                status: types_1.OutboxStatus.FAILED,
                lastError: error,
                retryCount: { increment: 1 },
            },
        });
    }
}
exports.OutboxRepository = OutboxRepository;
//# sourceMappingURL=outbox.repository.js.map