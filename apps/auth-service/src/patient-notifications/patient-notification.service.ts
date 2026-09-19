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
  ListPatientNotificationsQueryDto,
  ListPatientNotificationsResponseDto,
  PatientNotificationResponseDto,
} from './dto/patient-notification.dto';

/**
 * Every read/write is scoped exclusively by identity.userId (the server-verified global patient
 * identity) combined with the target notification's own id -- never
 * by a client-supplied recipientUserId/userId/actorUserId. A
 * cross-user access attempt resolves to "not found", never a
 * different error shape that would confirm existence.
 *
 * This is the patient IN-APP INBOX, distinct from
 * NotificationDelivery (tenant-scoped external delivery attempts) --
 * see the PatientNotification schema model for the distinction.
 */
@Injectable()
export class PatientNotificationService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    identity: AuthenticatedIdentity,
    query: ListPatientNotificationsQueryDto,
  ): Promise<ListPatientNotificationsResponseDto> {
    const cursor = decodeCursor(query.cursor);

    const items = await this.prisma.client.patientNotification.findMany({
      where: {
        recipientUserId: identity.userId,
        ...(query.unreadOnly ? { readAt: null } : {}),
        ...(cursor
          ? {
              OR: [
                { createdAt: { lt: cursor.createdAt } },
                { createdAt: cursor.createdAt, id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      select: SELECT_SHAPE,
    });

    const hasNextPage = items.length > query.limit;
    const page = hasNextPage ? items.slice(0, query.limit) : items;
    const nextCursor = hasNextPage
      ? encodeCursor(page[page.length - 1].createdAt, page[page.length - 1].id)
      : null;

    const unreadCount = await this.prisma.client.patientNotification.count({
      where: { recipientUserId: identity.userId, readAt: null },
    });

    return { items: page.map(toResponse), nextCursor, unreadCount };
  }

  /**
   * Idempotent: marking an already-read notification read again is a
   * safe no-op that returns the existing row, not an error -- read
   * state naturally tolerates retries. A notification belonging to a
   * different user resolves to NotFoundException either way, so a
   * cross-user probe cannot distinguish "not mine" from "doesn't
   * exist."
   */
  async markOneRead(
    identity: AuthenticatedIdentity,
    notificationId: string,
  ): Promise<PatientNotificationResponseDto> {
    const result = await this.prisma.client.patientNotification.updateMany({
      where: { id: notificationId, recipientUserId: identity.userId, readAt: null },
      data: { readAt: new Date() },
    });

    if (result.count === 0) {
      const existing = await this.prisma.client.patientNotification.findFirst({
        where: { id: notificationId, recipientUserId: identity.userId },
        select: SELECT_SHAPE,
      });
      if (!existing) {
        throw new NotFoundException('Notification not found');
      }
      // Already read -- idempotent no-op, return the current state.
      return toResponse(existing);
    }

    const updated = await this.prisma.client.patientNotification.findFirstOrThrow({
      where: { id: notificationId, recipientUserId: identity.userId },
      select: SELECT_SHAPE,
    });
    return toResponse(updated);
  }

  /**
   * Bounded and user-scoped by construction: the WHERE clause always
   * includes recipientUserId, so this can never touch another
   * patient's rows regardless of how many notifications exist overall
   * -- there is no code path resembling an unscoped
   * "UPDATE ... SET readAt = now()".
   */
  async markAllRead(identity: AuthenticatedIdentity): Promise<{ updatedCount: number }> {
    const result = await this.prisma.client.patientNotification.updateMany({
      where: { recipientUserId: identity.userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { updatedCount: result.count };
  }

  /**
   * Creates a patient notification from an upstream event id. There is no HTTP
   * route bound to this method -- it is reachable
   * only from server-side/internal callers, never from a patient
   * request, so sourceType/sourceEventId can never be selected through
   * a BFF/patient-facing path. The unique (sourceType, sourceEventId)
   * constraint is what makes redelivery of the same upstream event
   * safe: a second call with the same pair returns the original row
   * rather than creating a duplicate. sourceType is a bounded,
   * non-empty idempotency NAMESPACE identifying the producer/event
   * source -- deliberately a different value space from `category`
   * (patient-facing presentation classification): two independent
   * future producers could legitimately both create a
   * RESERVATION-category notification while emitting unrelated event
   * IDs, and this is exactly why sourceType, not category, is part of
   * the uniqueness key.
   *
   * Fail-closed across recipients: a (sourceType, sourceEventId)
   * collision is only ever treated as an idempotent replay if the
   * EXISTING row's recipientUserId matches the incoming one. If the
   * same source key was accidentally reused for a different
   * recipient, this throws a bounded internal error rather than
   * silently returning -- and critically, never returning -- another
   * patient's notification to the caller.
   */
  async createFromEvent(input: {
    sourceType: string;
    sourceEventId: string;
    recipientUserId: string;
    category: 'ACCOUNT' | 'SECURITY' | 'RESERVATION' | 'APPOINTMENT' | 'SYSTEM';
    title: string;
    message: string;
    destinationType?: 'NONE' | 'RESERVATION' | 'APPOINTMENT' | 'SETTINGS';
    destinationId?: string;
  }): Promise<PatientNotificationResponseDto> {
    // Normalize the idempotency namespace so "producer" and
    // " producer " (or "producer\t") are never treated as different
    // keys -- surrounding whitespace is stripped consistently before
    // both persistence and lookup. Opaque event-ID semantics
    // (sourceEventId itself) are left untouched: an upstream event ID
    // is not ours to reinterpret, only the namespace label is.
    const sourceType = input.sourceType.trim();
    const sourceEventId = input.sourceEventId;

    if (sourceType.length === 0 || sourceType.length > 80) {
      throw new BadRequestException('sourceType must be 1-80 characters');
    }
    if (sourceEventId.trim().length === 0 || sourceEventId.length > 120) {
      throw new BadRequestException('sourceEventId must be 1-120 characters');
    }
    if (input.title.length === 0 || input.title.length > 160) {
      throw new BadRequestException('title must be 1-160 characters');
    }
    if (input.message.length === 0 || input.message.length > 500) {
      throw new BadRequestException('message must be 1-500 characters');
    }
    validateDestination(input.destinationType ?? 'NONE', input.destinationId);

    try {
      const created = await this.prisma.client.patientNotification.create({
        data: {
          sourceType,
          sourceEventId,
          recipientUserId: input.recipientUserId,
          category: input.category,
          title: input.title,
          message: input.message,
          destinationType: input.destinationType ?? 'NONE',
          destinationId: input.destinationId,
        },
        select: { ...SELECT_SHAPE, recipientUserId: true },
      });
      return toResponse(created);
    } catch (error) {
      if (hasPrismaCode(error, 'P2002')) {
        const existing = await this.prisma.client.patientNotification.findUniqueOrThrow({
          where: { sourceType_sourceEventId: { sourceType, sourceEventId } },
          select: { ...SELECT_SHAPE, recipientUserId: true },
        });
        if (existing.recipientUserId !== input.recipientUserId) {
          // Fail closed: never return one patient's notification in
          // response to another patient's (or another caller's)
          // ingestion attempt, even under a genuine source-key
          // collision. recipientUserId is deliberately NOT added to
          // the uniqueness key itself -- that would hide a real
          // producer bug (the same event key legitimately means one
          // event; it should never resolve to more than one recipient
          // unless the domain model actually requires fan-out, which
          // is not established here) rather than surfacing it.
          throw new InternalServerErrorException(
            'Notification idempotency key collision across recipients',
          );
        }
        return toResponse(existing);
      }
      throw error;
    }
  }
}

function validateDestination(destinationType: string, destinationId: string | undefined): void {
  if (destinationType === 'NONE') {
    if (destinationId !== undefined) {
      throw new BadRequestException('destinationId must be omitted when destinationType is NONE');
    }
    return;
  }
  if (destinationId === undefined || destinationId.trim().length === 0) {
    throw new BadRequestException(
      `destinationId is required when destinationType is ${destinationType}`,
    );
  }
  if (destinationId.length > 120) {
    throw new BadRequestException('destinationId must be at most 120 characters');
  }
  // Reject anything resembling a URL scheme, protocol-relative path,
  // or external location -- destinationId is an internal identifier
  // ONLY, never a navigation target. This is what makes the
  // open-redirect guarantee executable rather than merely documented.
  if (/^[a-z][a-z0-9+.-]*:|^\/\/|[<>"'\\]/i.test(destinationId)) {
    throw new BadRequestException('destinationId must be a bounded internal identifier, not a URL');
  }
  if (destinationType === 'SETTINGS') {
    // SETTINGS has no accepted per-item identifier space today (it is
    // always the single settings destination) -- accepting an
    // arbitrary identifier here would be exactly the kind of
    // speculative Task 0034/0035 architecture this candidate must not
    // invent. Only a fixed, known token is accepted.
    if (destinationId !== 'privacy') {
      throw new BadRequestException(
        'SETTINGS destinationId must be the known internal token "privacy"',
      );
    }
    return;
  }
  // RESERVATION / APPOINTMENT: only the authoritative AIM UUID
  // identifier shape is accepted (MedicineReservation.id is a UUID;
  // Task 0035's provisional Appointment.id is also UUID-shaped, but
  // this validator is a generic UUID-v4 check, not a dependency on
  // Task 0035 candidate code -- it accepts the shape, never imports
  // or couples to that branch). Reuses the same UUID_V4_PATTERN
  // already used for cursor validation, rather than a looser
  // alphanumeric+hyphen pattern that would also accept non-UUID
  // garbage like "abc-def".
  if (!UUID_V4_PATTERN.test(destinationId)) {
    throw new BadRequestException(`destinationId for ${destinationType} must be a valid UUID`);
  }
}

const SELECT_SHAPE = {
  id: true,
  category: true,
  title: true,
  message: true,
  destinationType: true,
  destinationId: true,
  readAt: true,
  createdAt: true,
} as const;

type SelectedNotification = {
  id: string;
  category: string;
  title: string;
  message: string;
  destinationType: string;
  destinationId: string | null;
  readAt: Date | null;
  createdAt: Date;
};

function toResponse(notification: SelectedNotification): PatientNotificationResponseDto {
  return {
    id: notification.id,
    category: notification.category,
    title: notification.title,
    message: notification.message,
    destinationType: notification.destinationType,
    destinationId: notification.destinationId,
    readAt: notification.readAt ? notification.readAt.toISOString() : null,
    createdAt: notification.createdAt.toISOString(),
  };
}

function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(JSON.stringify({ createdAt: createdAt.toISOString(), id })).toString(
    'base64url',
  );
}

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function decodeCursor(cursor: string | undefined): { createdAt: Date; id: string } | null {
  if (!cursor) return null;
  try {
    const decoded: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) {
      throw new Error('malformed cursor');
    }
    // Exact keys only -- an extra property (or a missing one) is
    // rejected rather than silently ignored, so a cursor cannot be
    // partially forged or extended with unexpected data.
    const keys = Object.keys(decoded).sort();
    if (keys.length !== 2 || keys[0] !== 'createdAt' || keys[1] !== 'id') {
      throw new Error('malformed cursor');
    }
    const { createdAt: createdAtRaw, id } = decoded as { createdAt: unknown; id: unknown };
    if (typeof createdAtRaw !== 'string' || typeof id !== 'string') {
      throw new Error('malformed cursor');
    }
    if (!UUID_V4_PATTERN.test(id)) {
      throw new Error('malformed cursor');
    }
    const createdAt = new Date(createdAtRaw);
    if (Number.isNaN(createdAt.getTime())) {
      throw new Error('malformed cursor');
    }
    return { createdAt, id };
  } catch {
    // An invalid/tampered cursor is treated as a bad request, never
    // as a crash or as silently falling back to page one -- the
    // caller must know their pagination state was rejected.
    throw new BadRequestException('Invalid pagination cursor');
  }
}
