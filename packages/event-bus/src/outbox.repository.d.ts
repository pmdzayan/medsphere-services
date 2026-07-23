import { Prisma } from '@prisma/client';
export declare class OutboxRepository {
    private readonly prisma;
    create(data: {
        tenantId: string;
        eventType: string;
        aggregateType: string;
        aggregateId: string;
        payload: Record<string, unknown>;
        correlationId?: string;
    }): Promise<{
        id: string;
        eventType: string;
        aggregateType: string;
        aggregateId: string;
        payload: Prisma.JsonValue;
        correlationId: string | null;
        status: import("@prisma/client").$Enums.OutboxStatus;
        retryCount: number;
        lastError: string | null;
        scheduledFor: Date;
        publishedAt: Date | null;
        createdAt: Date;
        tenantId: string;
    }>;
    findPending(batchSize?: number): Promise<{
        id: string;
        eventType: string;
        aggregateType: string;
        aggregateId: string;
        payload: Prisma.JsonValue;
        correlationId: string | null;
        status: import("@prisma/client").$Enums.OutboxStatus;
        retryCount: number;
        lastError: string | null;
        scheduledFor: Date;
        publishedAt: Date | null;
        createdAt: Date;
        tenantId: string;
    }[]>;
    markProcessing(id: string): Promise<{
        id: string;
        eventType: string;
        aggregateType: string;
        aggregateId: string;
        payload: Prisma.JsonValue;
        correlationId: string | null;
        status: import("@prisma/client").$Enums.OutboxStatus;
        retryCount: number;
        lastError: string | null;
        scheduledFor: Date;
        publishedAt: Date | null;
        createdAt: Date;
        tenantId: string;
    }>;
    markPublished(id: string): Promise<{
        id: string;
        eventType: string;
        aggregateType: string;
        aggregateId: string;
        payload: Prisma.JsonValue;
        correlationId: string | null;
        status: import("@prisma/client").$Enums.OutboxStatus;
        retryCount: number;
        lastError: string | null;
        scheduledFor: Date;
        publishedAt: Date | null;
        createdAt: Date;
        tenantId: string;
    }>;
    markFailed(id: string, error: string): Promise<{
        id: string;
        eventType: string;
        aggregateType: string;
        aggregateId: string;
        payload: Prisma.JsonValue;
        correlationId: string | null;
        status: import("@prisma/client").$Enums.OutboxStatus;
        retryCount: number;
        lastError: string | null;
        scheduledFor: Date;
        publishedAt: Date | null;
        createdAt: Date;
        tenantId: string;
    }>;
}
