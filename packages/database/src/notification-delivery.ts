import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { withSerializableRetry } from './transaction';

const IDENTIFIER_LIMIT = 120;
const WORKFLOW_LIMIT = 80;
const PROVIDER_LIMIT = 80;
const VARIABLE_LIMIT_BYTES = 6 * 1024;
const FORBIDDEN_VARIABLE_KEY =
  /(password|credential|token|secret|authorization|email|phone|address|medical|clinical|patient)/i;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH_PATTERN = /^[0-9a-f]{64}$/;

export const NOTIFICATION_CHANNELS = ['EMAIL', 'SMS', 'WHATSAPP', 'PUSH'] as const;
export const NOTIFICATION_RECIPIENT_TYPES = [
  'TENANT_MEMBERSHIP',
  'TENANT_OPERATIONAL_ROUTE',
] as const;
export const NOTIFICATION_DELIVERY_STATES = [
  'PENDING',
  'PROCESSING',
  'FAILED',
  'DELIVERED',
  'DEAD_LETTER',
] as const;

export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];
export type NotificationRecipientType = (typeof NOTIFICATION_RECIPIENT_TYPES)[number];
export type NotificationDeliveryState = (typeof NOTIFICATION_DELIVERY_STATES)[number];

export interface EnqueueNotificationDeliveryInput {
  readonly tenantId: string;
  readonly sourceEventId: string;
  readonly workflowKey: string;
  readonly recipientType: NotificationRecipientType;
  readonly recipientReferenceId: string;
  readonly channel: NotificationChannel;
  readonly templateKey: string;
  readonly templateVersion: number;
  readonly variables: Prisma.InputJsonObject;
  readonly availableAt: Date;
}

export interface ClaimedNotificationDelivery {
  readonly deliveryId: string;
  readonly tenantId: string;
  readonly sourceEventId: string;
  readonly workflowKey: string;
  readonly recipientType: NotificationRecipientType;
  readonly recipientReferenceId: string;
  readonly channel: NotificationChannel;
  readonly templateKey: string;
  readonly templateVersion: number;
  readonly variables: Prisma.JsonValue;
  readonly attemptCount: number;
  readonly lockToken: string;
}

export type NotificationQueueDatabase = Pick<Prisma.TransactionClient, 'notificationDelivery'>;

export interface NotificationClaimHost {
  $queryRaw<T = unknown>(query: Prisma.Sql): Promise<T>;
}

export interface NotificationOutcomeHost {
  $transaction<T>(
    operation: (transaction: Prisma.TransactionClient) => Promise<T>,
    options: { isolationLevel: 'Serializable' },
  ): Promise<T>;
}

export function validateNotificationDelivery(input: EnqueueNotificationDeliveryInput): void {
  assertUuid(input.tenantId, 'Notification tenant id');
  assertUuid(input.sourceEventId, 'Notification source event id');
  assertBounded(input.workflowKey, WORKFLOW_LIMIT, 'Notification workflow key');
  assertBounded(input.recipientReferenceId, IDENTIFIER_LIMIT, 'Notification recipient reference');
  assertBounded(input.templateKey, IDENTIFIER_LIMIT, 'Notification template key');
  if (!NOTIFICATION_RECIPIENT_TYPES.includes(input.recipientType)) {
    throw new Error('Notification recipient type is not supported');
  }
  if (!NOTIFICATION_CHANNELS.includes(input.channel)) {
    throw new Error('Notification channel is not supported');
  }
  if (!Number.isSafeInteger(input.templateVersion) || input.templateVersion < 1) {
    throw new Error('Notification template version must be a positive safe integer');
  }
  if (!(input.availableAt instanceof Date) || !Number.isFinite(input.availableAt.getTime())) {
    throw new Error('Notification availability time must be a valid date');
  }
  validateVariables(input.variables);
}

export async function enqueueNotificationDelivery(
  database: NotificationQueueDatabase,
  input: EnqueueNotificationDeliveryInput,
): Promise<{ readonly enqueued: boolean }> {
  validateNotificationDelivery(input);
  const result = await database.notificationDelivery.createMany({
    data: {
      id: randomUUID(),
      tenantId: input.tenantId,
      sourceEventId: input.sourceEventId,
      workflowKey: input.workflowKey,
      recipientType: input.recipientType,
      recipientReferenceId: input.recipientReferenceId,
      channel: input.channel,
      templateKey: input.templateKey,
      templateVersion: input.templateVersion,
      variables: input.variables,
      availableAt: input.availableAt,
    },
    skipDuplicates: true,
  });
  return { enqueued: result.count === 1 };
}

export async function claimNotificationDeliveries(
  database: NotificationClaimHost,
  options: {
    readonly limit: number;
    readonly now: Date;
    readonly leaseMs: number;
    readonly tenantId?: string;
  },
): Promise<readonly ClaimedNotificationDelivery[]> {
  if (!Number.isSafeInteger(options.limit) || options.limit < 1 || options.limit > 100) {
    throw new Error('Notification claim limit must be between 1 and 100');
  }
  if (
    !Number.isSafeInteger(options.leaseMs) ||
    options.leaseMs < 1_000 ||
    options.leaseMs > 300_000
  ) {
    throw new Error('Notification lease must be between 1000 and 300000 milliseconds');
  }
  const lockToken = randomUUID();
  const lockedUntil = new Date(options.now.getTime() + options.leaseMs);
  return database.$queryRaw<ClaimedNotificationDelivery[]>(Prisma.sql`
    WITH candidates AS (
      SELECT d."id"
      FROM "NotificationDelivery" d
      WHERE ((
        d."status" IN ('PENDING', 'FAILED')
        AND d."availableAt" <= ${options.now}
      ) OR (
        d."status" = 'PROCESSING'
        AND d."lockedUntil" <= ${options.now}
      ))
      ${options.tenantId ? Prisma.sql`AND d."tenantId" = ${options.tenantId}::uuid` : Prisma.empty}
      ORDER BY d."availableAt" ASC, d."createdAt" ASC, d."id" ASC
      FOR UPDATE OF d SKIP LOCKED
      LIMIT ${options.limit}
    )
    UPDATE "NotificationDelivery" d
    SET "status" = 'PROCESSING',
        "lockedAt" = ${options.now},
        "lockedUntil" = ${lockedUntil},
        "lockToken" = ${lockToken},
        "attemptCount" = d."attemptCount" + 1,
        "lastErrorCode" = NULL
    FROM candidates c
    WHERE d."id" = c."id"
    RETURNING d."id" AS "deliveryId", d."tenantId", d."sourceEventId",
      d."workflowKey", d."recipientType", d."recipientReferenceId", d."channel",
      d."templateKey", d."templateVersion", d."variables", d."attemptCount", d."lockToken"
  `);
}

export async function recordNotificationDelivered(
  host: NotificationOutcomeHost,
  delivery: Pick<
    ClaimedNotificationDelivery,
    'deliveryId' | 'tenantId' | 'lockToken' | 'attemptCount'
  >,
  input: {
    readonly occurredAt: Date;
    readonly providerKey: string;
    readonly providerReferenceHash?: string;
  },
): Promise<void> {
  validateOutcomeInput(input.providerKey, input.providerReferenceHash);
  await withSerializableRetry(host, async (transaction) => {
    const updated = await transaction.notificationDelivery.updateMany({
      where: {
        id: delivery.deliveryId,
        tenantId: delivery.tenantId,
        status: 'PROCESSING',
        lockToken: delivery.lockToken,
      },
      data: {
        status: 'DELIVERED',
        deliveredAt: input.occurredAt,
        lockedAt: null,
        lockedUntil: null,
        lockToken: null,
        lastErrorCode: null,
      },
    });
    if (updated.count !== 1) throw new Error('Notification delivery lease was lost');
    await transaction.notificationDeliveryAttempt.create({
      data: {
        id: randomUUID(),
        tenantId: delivery.tenantId,
        deliveryId: delivery.deliveryId,
        attemptNumber: delivery.attemptCount,
        outcome: 'DELIVERED',
        providerKey: input.providerKey,
        providerReferenceHash: input.providerReferenceHash,
        occurredAt: input.occurredAt,
      },
      select: { id: true },
    });
  });
}

export async function recordNotificationFailed(
  host: NotificationOutcomeHost,
  delivery: Pick<
    ClaimedNotificationDelivery,
    'deliveryId' | 'tenantId' | 'lockToken' | 'attemptCount'
  >,
  input: {
    readonly occurredAt: Date;
    readonly providerKey: string;
    readonly errorCode: string;
    readonly maximumAttempts?: number;
  },
): Promise<'FAILED' | 'DEAD_LETTER'> {
  assertBounded(input.providerKey, PROVIDER_LIMIT, 'Notification provider key');
  assertBounded(input.errorCode, 80, 'Notification error code');
  const maximumAttempts = input.maximumAttempts ?? 8;
  if (!Number.isSafeInteger(maximumAttempts) || maximumAttempts < 1 || maximumAttempts > 25) {
    throw new Error('Notification maximum attempts must be between 1 and 25');
  }
  const deadLetter = delivery.attemptCount >= maximumAttempts;
  const status = deadLetter ? 'DEAD_LETTER' : 'FAILED';
  const availableAt = deadLetter
    ? input.occurredAt
    : new Date(input.occurredAt.getTime() + notificationRetryDelayMs(delivery.attemptCount));
  await withSerializableRetry(host, async (transaction) => {
    const updated = await transaction.notificationDelivery.updateMany({
      where: {
        id: delivery.deliveryId,
        tenantId: delivery.tenantId,
        status: 'PROCESSING',
        lockToken: delivery.lockToken,
      },
      data: {
        status,
        availableAt,
        lockedAt: null,
        lockedUntil: null,
        lockToken: null,
        lastErrorCode: input.errorCode,
      },
    });
    if (updated.count !== 1) throw new Error('Notification delivery lease was lost');
    await transaction.notificationDeliveryAttempt.create({
      data: {
        id: randomUUID(),
        tenantId: delivery.tenantId,
        deliveryId: delivery.deliveryId,
        attemptNumber: delivery.attemptCount,
        outcome: status,
        providerKey: input.providerKey,
        errorCode: input.errorCode,
        occurredAt: input.occurredAt,
      },
      select: { id: true },
    });
  });
  return status;
}

export function notificationRetryDelayMs(attemptCount: number): number {
  if (!Number.isSafeInteger(attemptCount) || attemptCount < 1) {
    throw new Error('Notification attempt count must be a positive safe integer');
  }
  return Math.min(60 * 60 * 1_000, 2_000 * 2 ** Math.min(attemptCount - 1, 11));
}

function validateOutcomeInput(providerKey: string, providerReferenceHash?: string): void {
  assertBounded(providerKey, PROVIDER_LIMIT, 'Notification provider key');
  if (providerReferenceHash !== undefined && !HASH_PATTERN.test(providerReferenceHash)) {
    throw new Error('Notification provider reference hash must be lowercase SHA-256');
  }
}

function validateVariables(variables: unknown): asserts variables is Prisma.InputJsonObject {
  if (
    typeof variables !== 'object' ||
    variables === null ||
    Array.isArray(variables) ||
    Object.getPrototypeOf(variables) !== Object.prototype
  ) {
    throw new Error('Notification variables must be a plain JSON object');
  }
  const encoded = JSON.stringify(variables);
  if (encoded === undefined || Buffer.byteLength(encoded, 'utf8') > VARIABLE_LIMIT_BYTES) {
    throw new Error('Notification variables exceed the application size limit');
  }
  validateJsonValue(variables, 0);
}

function validateJsonValue(value: unknown, depth: number): void {
  if (depth > 6) throw new Error('Notification variable nesting exceeds the application limit');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (Array.isArray(value)) {
    if (value.length > 50) throw new Error('Notification variable array exceeds the limit');
    for (const item of value) validateJsonValue(item, depth + 1);
    return;
  }
  if (typeof value !== 'object') throw new Error('Notification variables contain invalid JSON');
  for (const [key, item] of Object.entries(value)) {
    if (FORBIDDEN_VARIABLE_KEY.test(key)) {
      throw new Error(`Notification variables contain forbidden sensitive key: ${key}`);
    }
    assertBounded(key, 80, 'Notification variable key');
    validateJsonValue(item, depth + 1);
  }
}

function assertUuid(value: string, label: string): void {
  if (!UUID_PATTERN.test(value)) throw new Error(`${label} must be a UUID`);
}

function assertBounded(value: string, maximum: number, label: string): void {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > maximum) {
    throw new Error(`${label} must be between 1 and ${maximum} characters`);
  }
}
