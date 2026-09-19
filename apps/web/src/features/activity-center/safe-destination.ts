import type { PatientNotification } from '@/lib/patient-notification-contract';

/** Maps server-owned destination types to fixed patient routes. The
 * destination id is validated by the transport contract but is never
 * interpreted as a URL or path fragment.
 */
export function resolveSafeDestination(notification: PatientNotification): string | null {
  switch (notification.destinationType) {
    case 'NONE':
      return null;
    case 'SETTINGS':
      // The accepted settings page is staff-only, so it is not a safe
      // destination for a personal-account session.
      return null;
    case 'RESERVATION':
      return '/patient/medicines#reservations';
    case 'APPOINTMENT':
      // No accepted patient-facing appointment route exists yet.
      return null;
    default:
      return null;
  }
}
