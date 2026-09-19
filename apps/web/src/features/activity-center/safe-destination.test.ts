import { describe, expect, it } from 'vitest';
import type { PatientNotification } from '@/lib/patient-notification-contract';
import { resolveSafeDestination } from './safe-destination';

const baseNotification: PatientNotification = {
  id: '11111111-1111-4111-8111-111111111111',
  category: 'RESERVATION',
  title: 'Reservation updated',
  message: 'Your reservation status changed.',
  destinationType: 'RESERVATION',
  destinationId: '22222222-2222-4222-8222-222222222222',
  readAt: null,
  createdAt: '2026-09-18T12:00:00.000Z',
};

describe('resolveSafeDestination', () => {
  it('maps a reservation to the accepted patient reservation list', () => {
    expect(resolveSafeDestination(baseNotification)).toBe('/patient/medicines#reservations');
  });

  it.each(['NONE', 'SETTINGS', 'APPOINTMENT'] as const)(
    'does not invent a route for %s',
    (destinationType) => {
      expect(
        resolveSafeDestination({
          ...baseNotification,
          destinationType,
          destinationId: destinationType === 'NONE' ? null : baseNotification.destinationId,
        }),
      ).toBeNull();
    },
  );
});
