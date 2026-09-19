import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { hasPrismaCode } from '@medsphere/database';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedIdentity } from '../auth/auth.types';
import type {
  ListPatientTimelineQueryDto,
  ListPatientTimelineResponseDto,
  PatientTimelineEventResponseDto,
} from './dto/patient-timeline.dto';

const EVENT_TYPE_MAX_LENGTH = 80;
const SOURCE_TYPE_MAX_LENGTH = 80;
const SOURCE_EVENT_ID_MAX_LENGTH = 120;
const TITLE_MAX_LENGTH = 160;
const SUMMARY_MAX_LENGTH = 500;
const DESTINATION_ID_MAX_LENGTH = 120;

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACCEPTED_DESTINATION_TYPES = ['NONE', 'RESERVATION', 'APPOINTMENT', 'SETTINGS'] as const;

/**
 * Read-only from the patient side --
 * there is no create/update/delete HTTP endpoint anywhere in this
 * module. Every read is scoped exclusively by identity.userId (the
 * server-verified global patient identity) combined with the target
 * event's own id -- never by a client-supplied recipientUserId. A
 * cross-patient access attempt resolves to "not found," never a
 * different error shape that would confirm existence.
 *
 * This is the patient-facing longitudinal history PROJECTION,
 * deliberately distinct from AuditEvent (operational/security
 * accountability, not patient-facing) and from the notification
 * inbox (transient read-state, not longitudinal
 * history). It is not a clinical source of truth -- see the schema
 * comment for the full distinction.
 */
@Injectable()
export class PatientTimelineService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    identity: AuthenticatedIdentity,
    query: ListPatientTimelineQueryDto,
  ): Promise<ListPatientTimelineResponseDto> {
    const cursor = decodeCursor(query.cursor);

    const items = await this.prisma.client.patientTimelineEvent.findMany({
      where: {
        recipientUserId: identity.userId,
        ...(cursor
          ? {
              OR: [
                { occurredAt: { lt: cursor.occurredAt } },
                { occurredAt: cursor.occurredAt, id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      select: SELECT_SHAPE,
    });

    const hasNextPage = items.length > query.limit;
    const page = hasNextPage ? items.slice(0, query.limit) : items;
    const nextCursor = hasNextPage
      ? encodeCursor(page[page.length - 1].occurredAt, page[page.length - 1].id)
      : null;

    return { items: page.map(toResponse), nextCursor };
  }

  async getOne(
    identity: AuthenticatedIdentity,
    timelineEventId: string,
  ): Promise<PatientTimelineEventResponseDto> {
    const event = await this.prisma.client.patientTimelineEvent.findFirst({
      where: { id: timelineEventId, recipientUserId: identity.userId },
      select: SELECT_SHAPE,
    });
    if (!event) {
      throw new NotFoundException('Timeline event not found');
    }
    return toResponse(event);
  }

  /**
   * Internal server-only ingestion seam. Reservation status changes are
   * projected transactionally by the reservation services; this method
   * supports other reviewed event producers without an HTTP write route.
   *
   * Fail-closed across recipients: a (sourceType, sourceEventId)
   * collision is only ever treated as an idempotent replay if the
   * EXISTING row's recipientUserId matches the incoming one. If the
   * same source key was accidentally reused for a different
   * recipient, this throws a bounded internal error rather than
   * silently returning -- and critically, never returning -- another
   * patient's timeline event.
   */
  async createFromEvent(input: {
    sourceType: string;
    sourceEventId: string;
    recipientUserId: string;
    eventType: string;
    title: string;
    summary: string;
    occurredAt: Date;
    destinationType?: 'NONE' | 'RESERVATION' | 'APPOINTMENT' | 'SETTINGS';
    destinationId?: string;
  }): Promise<PatientTimelineEventResponseDto> {
    // Runtime-total validation: this is a server-only seam today, but
    // it is still a future event-ingestion boundary and must not
    // trust that a caller's runtime values actually match their
    // TypeScript-declared types -- a malformed value here must
    // produce a bounded application error, never a raw TypeError
    // (e.g. "getTime is not a function") or a silent pass-through to
    // Prisma/the database.
    if (!UUID_V4_PATTERN.test(input.recipientUserId)) {
      throw new BadRequestException('recipientUserId must be a valid UUID');
    }
    if (!(input.occurredAt instanceof Date) || !Number.isFinite(input.occurredAt.getTime())) {
      throw new BadRequestException('occurredAt must be a valid Date');
    }
    if (!ACCEPTED_DESTINATION_TYPES.includes(input.destinationType ?? 'NONE')) {
      throw new BadRequestException('destinationType must be one of the accepted values');
    }
    // Nullish-coalescing (??) treats explicit `null` the same as
    // `undefined`, which would silently let a malformed runtime caller
    // pass destinationType: null and have it become NONE. Only a
    // genuinely absent (undefined) destinationType means NONE; an
    // explicit null is itself an invalid value and must fail closed
    // like any other value outside the exact catalogue.
    if (input.destinationType === null) {
      throw new BadRequestException('destinationType must be one of the accepted values');
    }

    const sourceType = requireBounded(input.sourceType, 'sourceType', SOURCE_TYPE_MAX_LENGTH);
    // Trimmed like sourceType (default behavior) -- leading/trailing
    // whitespace has no established semantic meaning for an upstream
    // event ID, and NOT trimming previously let " " (whitespace-only)
    // slip past the empty-check entirely, and would have let
    // "evt-1" and "  evt-1  " silently become two different
    // idempotency identities.
    const sourceEventId = requireBounded(
      input.sourceEventId,
      'sourceEventId',
      SOURCE_EVENT_ID_MAX_LENGTH,
    );
    const eventType = requireBounded(input.eventType, 'eventType', EVENT_TYPE_MAX_LENGTH);
    const title = requireBounded(input.title, 'title', TITLE_MAX_LENGTH);
    const summary = requireBounded(input.summary, 'summary', SUMMARY_MAX_LENGTH);
    validateDestination(input.destinationType ?? 'NONE', input.destinationId);

    try {
      const created = await this.prisma.client.patientTimelineEvent.create({
        data: {
          sourceType,
          sourceEventId,
          recipientUserId: input.recipientUserId,
          eventType,
          title,
          summary,
          occurredAt: input.occurredAt,
          destinationType: input.destinationType ?? 'NONE',
          destinationId: input.destinationId,
        },
        select: { ...SELECT_SHAPE, recipientUserId: true },
      });
      return toResponse(created);
    } catch (error) {
      if (hasPrismaCode(error, 'P2002')) {
        const existing = await this.prisma.client.patientTimelineEvent.findUniqueOrThrow({
          where: { sourceType_sourceEventId: { sourceType, sourceEventId } },
          select: { ...SELECT_SHAPE, recipientUserId: true },
        });
        if (existing.recipientUserId !== input.recipientUserId) {
          throw new InternalServerErrorException(
            'Timeline idempotency key collision across recipients',
          );
        }
        return toResponse(existing);
      }
      throw error;
    }
  }
}

const SELECT_SHAPE = {
  id: true,
  eventType: true,
  title: true,
  summary: true,
  destinationType: true,
  destinationId: true,
  occurredAt: true,
  createdAt: true,
} as const;

type SelectedEvent = {
  id: string;
  eventType: string;
  title: string;
  summary: string;
  destinationType: string;
  destinationId: string | null;
  occurredAt: Date;
  createdAt: Date;
};

function toResponse(event: SelectedEvent): PatientTimelineEventResponseDto {
  return {
    id: event.id,
    eventType: event.eventType,
    title: event.title,
    summary: event.summary,
    destinationType: event.destinationType,
    destinationId: event.destinationId,
    occurredAt: event.occurredAt.toISOString(),
    createdAt: event.createdAt.toISOString(),
  };
}

/**
 * Whitespace-only values must fail -- checking `value.length > 0`
 * alone is insufficient (correction learned in candidate Task 0036).
 * Trims, then validates non-empty and bounded length. Accepts
 * `unknown` rather than trusting the caller's TypeScript type at
 * runtime: this is a future event-ingestion boundary, and a
 * non-string value (a number, null, an object) must produce this same
 * bounded validation error, never a raw TypeError from calling
 * .trim()/.length on something that isn't a string.
 */
function requireBounded(value: unknown, fieldName: string, maxLength: number): string {
  if (typeof value !== 'string') {
    throw new BadRequestException(`${fieldName} must be a string`);
  }
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new BadRequestException(`${fieldName} cannot be empty or whitespace-only`);
  }
  if (normalized.length > maxLength) {
    throw new BadRequestException(`${fieldName} must be at most ${maxLength} characters`);
  }
  return normalized;
}

function validateDestination(destinationType: string, destinationId: unknown): void {
  if (destinationType === 'NONE') {
    if (destinationId !== undefined) {
      throw new BadRequestException('destinationId must be omitted when destinationType is NONE');
    }
    return;
  }
  // Runtime-total: a malformed future producer could pass a number,
  // object, array, boolean, or null through this seam despite the
  // TypeScript type declaring destinationId as string | undefined --
  // that declared type is erased at runtime and must not be trusted.
  // Every non-string, non-undefined value must fail with this same
  // bounded BadRequestException, never a raw TypeError from calling
  // .trim()/.length on something that isn't a string.
  if (destinationId === undefined) {
    throw new BadRequestException(
      `destinationId is required when destinationType is ${destinationType}`,
    );
  }
  if (typeof destinationId !== 'string') {
    throw new BadRequestException('destinationId must be a string');
  }
  if (destinationId.trim().length === 0) {
    throw new BadRequestException(
      `destinationId is required when destinationType is ${destinationType}`,
    );
  }
  if (destinationId.length > DESTINATION_ID_MAX_LENGTH) {
    throw new BadRequestException(
      `destinationId must be at most ${DESTINATION_ID_MAX_LENGTH} characters`,
    );
  }
  // Reject anything resembling a URL scheme, protocol-relative path, or
  // external location -- destinationId is an internal identifier ONLY,
  // never a navigation target.
  if (/^[a-z][a-z0-9+.-]*:|^\/\/|[<>"'\\]/i.test(destinationId)) {
    throw new BadRequestException('destinationId must be a bounded internal identifier, not a URL');
  }
  if (destinationType === 'SETTINGS') {
    if (destinationId !== 'privacy') {
      throw new BadRequestException(
        'SETTINGS destinationId must be the known internal token "privacy"',
      );
    }
    return;
  }
  // RESERVATION / APPOINTMENT: matches the authoritative AIM UUID
  // identifier shape (e.g. MedicineReservation.id is a UUID). This is
  // a generic UUID-v4 shape check, independent of appointment routes.
  if (!UUID_V4_PATTERN.test(destinationId)) {
    throw new BadRequestException(`destinationId for ${destinationType} must be a valid UUID`);
  }
}

function encodeCursor(occurredAt: Date, id: string): string {
  return Buffer.from(JSON.stringify({ occurredAt: occurredAt.toISOString(), id })).toString(
    'base64url',
  );
}

function decodeCursor(cursor: string | undefined): { occurredAt: Date; id: string } | null {
  if (!cursor) return null;
  try {
    const decoded: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) {
      throw new Error('malformed cursor');
    }
    const keys = Object.keys(decoded).sort();
    if (keys.length !== 2 || keys[0] !== 'id' || keys[1] !== 'occurredAt') {
      throw new Error('malformed cursor');
    }
    const { occurredAt: occurredAtRaw, id } = decoded as { occurredAt: unknown; id: unknown };
    if (typeof occurredAtRaw !== 'string' || typeof id !== 'string') {
      throw new Error('malformed cursor');
    }
    if (!UUID_V4_PATTERN.test(id)) {
      throw new Error('malformed cursor');
    }
    const occurredAt = new Date(occurredAtRaw);
    if (Number.isNaN(occurredAt.getTime())) {
      throw new Error('malformed cursor');
    }
    return { occurredAt, id };
  } catch {
    // An invalid/tampered cursor is treated as a bad request, never as
    // a crash or as silently falling back to page one.
    throw new BadRequestException('Invalid pagination cursor');
  }
}
