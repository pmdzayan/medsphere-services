import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { DomainEventEnvelope } from '@medsphere/types';
import { withSerializableRetry } from './transaction';

const IDENTIFIER_LIMIT = 120;
const AGGREGATE_TYPE_LIMIT = 80;
const SYSTEM_SERVICE_LIMIT = 80;
const PAYLOAD_LIMIT_BYTES = 12 * 1024;
const FORBIDDEN_PAYLOAD_KEY =
  /(password|credential|token|secret|authorization|email|phone|medical|clinical)/i;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type OutboxDatabase = Pick<Prisma.TransactionClient, 'outboxEvent'>;
export type TenantDomainEvent = DomainEventEnvelope<Prisma.InputJsonObject> & {
  readonly actor:
    | {
        readonly actorType: 'TENANT_USER';
        readonly tenantId: string;
        readonly membershipId: string;
        readonly userId: string;
      }
    | {
        readonly actorType: 'SYSTEM';
        readonly tenantId: string;
        readonly service: string;
      };
};

export interface ClaimedOutboxEvent {
  readonly eventId: string;
  readonly tenantId: string;
  readonly eventType: string;
  readonly eventVersion: number;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly occurredAt: Date;
  readonly actorType: 'TENANT_USER' | 'SYSTEM';
  readonly actorMembershipId: string | null;
  readonly actorUserId: string | null;
  readonly systemService: string | null;
  readonly correlationId: string | null;
  readonly causationId: string | null;
  readonly payload: Prisma.JsonValue;
  readonly attemptCount: number;
  readonly lockToken: string;
}

export interface OutboxRelayHost {
  $queryRaw<T = unknown>(query: Prisma.Sql): Promise<T>;
  outboxEvent: {
    updateMany(args: Prisma.OutboxEventUpdateManyArgs): Promise<{ count: number }>;
  };
}

export interface OutboxTransactionHost {
  $transaction<T>(
    operation: (transaction: Prisma.TransactionClient) => Promise<T>,
    options: { isolationLevel: 'Serializable' },
  ): Promise<T>;
}

export function validateTenantDomainEvent(event: TenantDomainEvent): void {
  assertUuid(event.eventId, 'Event id');
  assertUuid(event.actor.tenantId, 'Tenant id');
  assertBounded(event.eventType, IDENTIFIER_LIMIT, 'Event type');
  assertBounded(event.aggregateType, AGGREGATE_TYPE_LIMIT, 'Aggregate type');
  assertBounded(event.aggregateId, IDENTIFIER_LIMIT, 'Aggregate id');
  if (!Number.isSafeInteger(event.eventVersion) || event.eventVersion < 1) {
    throw new Error('Event version must be a positive safe integer');
  }
  if (!Number.isFinite(Date.parse(event.occurredAt))) {
    throw new Error('Event occurrence time must be an ISO date-time');
  }
  if (event.correlationId !== undefined) {
    assertBounded(event.correlationId, IDENTIFIER_LIMIT, 'Correlation id');
  }
  if (event.causationId !== undefined) {
    assertBounded(event.causationId, IDENTIFIER_LIMIT, 'Causation id');
  }
  if (event.actor.actorType === 'TENANT_USER') {
    assertUuid(event.actor.membershipId, 'Actor membership id');
    assertUuid(event.actor.userId, 'Actor user id');
  } else {
    assertBounded(event.actor.service, SYSTEM_SERVICE_LIMIT, 'System service');
  }
  validatePayload(event.payload);
}

export async function appendOutboxEvent(
  database: OutboxDatabase,
  event: TenantDomainEvent,
): Promise<void> {
  validateTenantDomainEvent(event);
  await database.outboxEvent.create({
    data: {
      id: event.eventId,
      tenantId: event.actor.tenantId,
      eventType: event.eventType,
      eventVersion: event.eventVersion,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      actorType: event.actor.actorType,
      actorMembershipId:
        event.actor.actorType === 'TENANT_USER' ? event.actor.membershipId : null,
      actorUserId: event.actor.actorType === 'TENANT_USER' ? event.actor.userId : null,
      systemService: event.actor.actorType === 'SYSTEM' ? event.actor.service : null,
      correlationId: event.correlationId,
      causationId: event.causationId,
      payload: event.payload,
      occurredAt: new Date(event.occurredAt),
      availableAt: new Date(event.occurredAt),
    },
    select: { id: true },
  });
}

export async function claimOutboxEvents(
  database: OutboxRelayHost,
  options: { readonly limit: number; readonly now: Date; readonly leaseMs: number },
): Promise<readonly ClaimedOutboxEvent[]> {
  if (!Number.isSafeInteger(options.limit) || options.limit < 1 || options.limit > 100) {
    throw new Error('Outbox claim limit must be between 1 and 100');
  }
  if (
    !Number.isSafeInteger(options.leaseMs) ||
    options.leaseMs < 1_000 ||
    options.leaseMs > 300_000
  ) {
    throw new Error('Outbox lease must be between 1000 and 300000 milliseconds');
  }
  const lockToken = randomUUID();
  const lockedUntil = new Date(options.now.getTime() + options.leaseMs);
  return database.$queryRaw<ClaimedOutboxEvent[]>(Prisma.sql`
    WITH candidates AS (
      SELECT e."id"
      FROM "OutboxEvent" e
      WHERE ((
        e."status" IN ('PENDING', 'FAILED')
        AND e."availableAt" <= ${options.now}
      ) OR (
        e."status" = 'PROCESSING'
        AND e."lockedUntil" <= ${options.now}
      ))
      ORDER BY e."availableAt" ASC, e."occurredAt" ASC, e."id" ASC
      FOR UPDATE OF e SKIP LOCKED
      LIMIT ${options.limit}
    )
    UPDATE "OutboxEvent" e
    SET "status" = 'PROCESSING',
        "lockedAt" = ${options.now},
        "lockedUntil" = ${lockedUntil},
        "lockToken" = ${lockToken},
        "attemptCount" = e."attemptCount" + 1,
        "lastErrorCode" = NULL
    FROM candidates c
    WHERE e."id" = c."id"
    RETURNING e."id" AS "eventId", e."tenantId", e."eventType", e."eventVersion",
      e."aggregateType", e."aggregateId", e."occurredAt", e."actorType",
      e."actorMembershipId", e."actorUserId", e."systemService",
      e."correlationId", e."causationId", e."payload", e."attemptCount", e."lockToken"
  `);
}

export async function markOutboxDelivered(
  database: OutboxRelayHost,
  event: Pick<ClaimedOutboxEvent, 'eventId' | 'lockToken'>,
  deliveredAt: Date,
): Promise<void> {
  const result = await database.outboxEvent.updateMany({
    where: { id: event.eventId, status: 'PROCESSING', lockToken: event.lockToken },
    data: {
      status: 'DELIVERED',
      deliveredAt,
      lockedAt: null,
      lockedUntil: null,
      lockToken: null,
      lastErrorCode: null,
    },
  });
  if (result.count !== 1) throw new Error('Outbox delivery lease was lost');
}

export async function markOutboxFailed(
  database: OutboxRelayHost,
  event: Pick<ClaimedOutboxEvent, 'eventId' | 'lockToken' | 'attemptCount'>,
  input: {
    readonly now: Date;
    readonly errorCode: string;
    readonly maximumAttempts?: number;
  },
): Promise<'FAILED' | 'DEAD_LETTER'> {
  assertBounded(input.errorCode, 80, 'Outbox error code');
  const maximumAttempts = input.maximumAttempts ?? 10;
  if (!Number.isSafeInteger(maximumAttempts) || maximumAttempts < 1 || maximumAttempts > 25) {
    throw new Error('Outbox maximum attempts must be between 1 and 25');
  }
  const deadLetter = event.attemptCount >= maximumAttempts;
  const status = deadLetter ? 'DEAD_LETTER' : 'FAILED';
  const availableAt = deadLetter
    ? input.now
    : new Date(input.now.getTime() + retryDelayMs(event.attemptCount));
  const result = await database.outboxEvent.updateMany({
    where: { id: event.eventId, status: 'PROCESSING', lockToken: event.lockToken },
    data: {
      status,
      availableAt,
      lockedAt: null,
      lockedUntil: null,
      lockToken: null,
      lastErrorCode: input.errorCode,
    },
  });
  if (result.count !== 1) throw new Error('Outbox failure lease was lost');
  return status;
}

export async function consumeOutboxEventOnce<T>(
  host: OutboxTransactionHost,
  input: {
    readonly tenantId: string;
    readonly eventId: string;
    readonly consumerName: string;
  },
  operation: (transaction: Prisma.TransactionClient) => Promise<T>,
): Promise<{ readonly processed: boolean; readonly result?: T }> {
  assertUuid(input.tenantId, 'Inbox tenant id');
  assertUuid(input.eventId, 'Inbox event id');
  assertBounded(input.consumerName, 80, 'Inbox consumer name');
  return withSerializableRetry(host, async (transaction) => {
    const receipt = await transaction.eventInboxReceipt.createMany({
      data: {
        id: randomUUID(),
        tenantId: input.tenantId,
        eventId: input.eventId,
        consumerName: input.consumerName,
      },
      skipDuplicates: true,
    });
    if (receipt.count === 0) return { processed: false };
    const result = await operation(transaction);
    return { processed: true, result };
  });
}

export function retryDelayMs(attemptCount: number): number {
  if (!Number.isSafeInteger(attemptCount) || attemptCount < 1) {
    throw new Error('Outbox attempt count must be a positive safe integer');
  }
  return Math.min(60 * 60 * 1_000, 1_000 * 2 ** Math.min(attemptCount - 1, 12));
}

function validatePayload(payload: unknown): asserts payload is Prisma.InputJsonObject {
  if (
    typeof payload !== 'object' ||
    payload === null ||
    Array.isArray(payload) ||
    Object.getPrototypeOf(payload) !== Object.prototype
  ) {
    throw new Error('Event payload must be a plain JSON object');
  }
  let encoded: string;
  try {
    encoded = JSON.stringify(payload);
  } catch {
    throw new Error('Event payload must be serializable JSON');
  }
  if (encoded === undefined || Buffer.byteLength(encoded, 'utf8') > PAYLOAD_LIMIT_BYTES) {
    throw new Error('Event payload exceeds the application size limit');
  }
  validateJsonValue(payload, 0);
}

function validateJsonValue(value: unknown, depth: number): void {
  if (depth > 8) throw new Error('Event payload nesting exceeds the application limit');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (Array.isArray(value)) {
    if (value.length > 100) throw new Error('Event payload array exceeds the application limit');
    for (const item of value) validateJsonValue(item, depth + 1);
    return;
  }
  if (typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error('Event payload contains a non-JSON value');
  }
  for (const [key, item] of Object.entries(value)) {
    if (FORBIDDEN_PAYLOAD_KEY.test(key)) {
      throw new Error('Event payload contains a forbidden sensitive key');
    }
    validateJsonValue(item, depth + 1);
  }
}

function assertUuid(value: string, label: string): void {
  if (!UUID_PATTERN.test(value)) throw new Error(`${label} must be a UUID`);
}

function assertBounded(value: string, maximum: number, label: string): void {
  if (value.length < 1 || value.length > maximum || value.trim() !== value) {
    throw new Error(`${label} must be non-empty, trimmed, and at most ${maximum} characters`);
  }
}
