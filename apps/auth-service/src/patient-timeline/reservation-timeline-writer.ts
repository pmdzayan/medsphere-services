import type { Prisma } from '@medsphere/database';

type ReservationStatus = 'PENDING' | 'CONFIRMED' | 'READY' | 'COMPLETED' | 'CANCELLED';

const PRESENTATION: Record<ReservationStatus, { title: string; summary: string }> = {
  PENDING: {
    title: 'Reservation created',
    summary: 'Your medicine reservation was created.',
  },
  CONFIRMED: {
    title: 'Reservation confirmed',
    summary: 'Your medicine reservation was confirmed.',
  },
  READY: {
    title: 'Reservation ready',
    summary: 'Your medicine reservation is ready for pickup.',
  },
  COMPLETED: {
    title: 'Reservation completed',
    summary: 'Your medicine reservation was completed.',
  },
  CANCELLED: {
    title: 'Reservation cancelled',
    summary: 'Your medicine reservation was cancelled.',
  },
};

/** Writes the projection in the same transaction as the authoritative status change. */
export async function writeReservationTimelineEvent(
  transaction: Prisma.TransactionClient,
  input: {
    reservationId: string;
    recipientUserId: string;
    status: ReservationStatus;
    version: number;
    occurredAt: Date;
  },
): Promise<void> {
  await transaction.patientTimelineEvent.create({
    data: {
      recipientUserId: input.recipientUserId,
      sourceType: 'medicine-reservation-status-v1',
      sourceEventId: `${input.reservationId}:${input.version}`,
      eventType: 'RESERVATION_STATUS_CHANGED',
      ...PRESENTATION[input.status],
      destinationType: 'RESERVATION',
      destinationId: input.reservationId,
      occurredAt: input.occurredAt,
    },
  });
}
