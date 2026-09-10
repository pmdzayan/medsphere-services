/**
 * Task 0026 - Availability request expiry.
 *
 * Bounded background sweep that transitions PENDING requests whose
 * `expiresAt` has passed to EXPIRED and clears their activeDedupKey so a new
 * request may be created. It uses the same bounded worker pattern as the
 * reservation/batch expiry services.
 *
 * Expiry is best-effort housekeeping: the authoritative fail-closed check is
 * the per-request `isPendingRequestExpired` guard inside the response path.
 * An unsigned expired request can never be responded to even if this sweep
 * has not yet run; this sweep only keeps the queue from accumulating stale
 * PENDING rows.
 */
import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma, hasPrismaCode, withSerializableRetry } from '@medsphere/database';
import { appMetrics } from '@medsphere/common';
import { PrismaService } from '../prisma/prisma.service';

export interface AvailabilityRequestExpiryConfig {
  readonly batchSize: number;
  readonly maximumRecords: number;
}

export interface AvailabilityRequestExpirySummary {
  readonly asOf: Date;
  readonly selected: number;
  readonly expired: number;
  readonly skipped: number;
  readonly failed: number;
  readonly failures: Readonly<Record<string, number>>;
}

export const AVAILABILITY_REQUEST_DEFAULT_BATCH_SIZE = 50;
export const AVAILABILITY_REQUEST_MAXIMUM_BATCH_SIZE = 100;
export const AVAILABILITY_REQUEST_DEFAULT_MAXIMUM_RECORDS = 500;
export const AVAILABILITY_REQUEST_HARD_MAXIMUM_RECORDS = 1_000;

export function parseAvailabilityRequestExpiryEnvironment(
  environment: NodeJS.ProcessEnv,
): AvailabilityRequestExpiryConfig {
  return {
    batchSize: parseBoundedInteger(
      environment.AVAILABILITY_REQUEST_EXPIRY_BATCH_SIZE,
      AVAILABILITY_REQUEST_DEFAULT_BATCH_SIZE,
      AVAILABILITY_REQUEST_MAXIMUM_BATCH_SIZE,
      'AVAILABILITY_REQUEST_EXPIRY_BATCH_SIZE',
    ),
    maximumRecords: parseBoundedInteger(
      environment.AVAILABILITY_REQUEST_EXPIRY_MAX_RECORDS,
      AVAILABILITY_REQUEST_DEFAULT_MAXIMUM_RECORDS,
      AVAILABILITY_REQUEST_HARD_MAXIMUM_RECORDS,
      'AVAILABILITY_REQUEST_EXPIRY_MAX_RECORDS',
    ),
  };
}
@Injectable()
export class AvailabilityRequestExpiryService {
  constructor(private readonly prisma: PrismaService) {}

  async run(config: AvailabilityRequestExpiryConfig): Promise<AvailabilityRequestExpirySummary> {
    validateConfig(config);
    const [{ asOf }] = await this.prisma.client.$queryRaw<Array<{ asOf: Date }>>(
      Prisma.sql`SELECT CURRENT_TIMESTAMP AS "asOf"`,
    );
    if (!(asOf instanceof Date) || Number.isNaN(asOf.getTime())) {
      throw new Error('Database did not return an authoritative expiry timestamp');
    }

    const attemptedIds: string[] = [];
    let expired = 0;
    let skipped = 0;
    let failed = 0;
    const failures: Record<string, number> = {};

    while (attemptedIds.length < config.maximumRecords) {
      const remaining = config.maximumRecords - attemptedIds.length;
      const candidates = await this.prisma.client.availabilityRequest.findMany({
        where: {
          status: 'PENDING',
          expiresAt: { lte: asOf },
          ...(attemptedIds.length > 0 ? { id: { notIn: attemptedIds } } : {}),
        },
        orderBy: [{ expiresAt: 'asc' }, { tenantId: 'asc' }, { id: 'asc' }],
        take: Math.min(config.batchSize, remaining),
        select: { id: true, tenantId: true, status: true },
      });
      if (candidates.length === 0) break;

      for (const candidate of candidates) {
        attemptedIds.push(candidate.id);
        try {
          const outcome = await this.expire(candidate, asOf);
          if (outcome === 'EXPIRED') expired += 1;
          else skipped += 1;
        } catch (error) {
          failed += 1;
          const category = failureCategory(error);
          failures[category] = (failures[category] ?? 0) + 1;
        }
      }
    }

    if (expired > 0) {
      appMetrics.availabilityExpirationTotal.increment({ outcome: 'expired' }, expired);
    }

    return {
      asOf,
      selected: attemptedIds.length,
      expired,
      skipped,
      failed,
      failures,
    };
  }

  private expire(
    candidate: { id: string; tenantId: string },
    asOf: Date,
  ): Promise<'EXPIRED' | 'SKIPPED'> {
    return withSerializableRetry(this.prisma.client, async (transaction) => {
      const request = await transaction.availabilityRequest.findFirst({
        where: { id: candidate.id, tenantId: candidate.tenantId },
        select: { id: true, version: true, status: true },
      });
      if (!request) return 'SKIPPED';
      // Only touch rows still PENDING; a concurrent responder transitioning to
      // RESPONDED must not be written over.
      if (request.status !== 'PENDING') return 'SKIPPED';

      const updated = await transaction.availabilityRequest.updateMany({
        where: {
          id: request.id,
          tenantId: candidate.tenantId,
          status: 'PENDING',
          expiresAt: { lte: asOf },
          version: request.version,
        },
        data: { status: 'EXPIRED', activeDedupKey: null, version: { increment: 1 } },
      });
      if (updated.count !== 1) return 'SKIPPED';
      return 'EXPIRED';
    });
  }
}

function validateConfig(config: AvailabilityRequestExpiryConfig): void {
  if (!Number.isSafeInteger(config.batchSize) || config.batchSize < 1 || config.batchSize > 100) {
    throw new Error('Availability request expiry batch size must be between 1 and 100');
  }
  if (
    !Number.isSafeInteger(config.maximumRecords) ||
    config.maximumRecords < 1 ||
    config.maximumRecords > 1_000
  ) {
    throw new Error('Availability request expiry maximum records must be between 1 and 1000');
  }
}

function failureCategory(error: unknown): string {
  if (error instanceof ConflictException) return 'invariant_conflict';
  if (hasPrismaCode(error, 'P2002')) return 'command_conflict';
  if (hasPrismaCode(error, 'P2034')) return 'concurrency_conflict';
  return 'unexpected';
}

function parseBoundedInteger(
  raw: string | undefined,
  fallback: number,
  maximum: number,
  name: string,
): number {
  if (raw === undefined) return fallback;
  if (!/^[1-9][0-9]*$/.test(raw)) throw new Error(`${name} must be a positive integer`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value > maximum) {
    throw new Error(`${name} must be between 1 and ${maximum}`);
  }
  return value;
}
