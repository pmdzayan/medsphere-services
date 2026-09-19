import type { PatientTimelineEvent } from '@/lib/patient-timeline-contract';

/** Only fixed patient routes; destinationId is never used as a URL. */
export function resolveSafeDestination(event: PatientTimelineEvent): string | null {
  switch (event.destinationType) {
    case 'NONE':
      return null;
    case 'SETTINGS':
      return null;
    case 'RESERVATION':
      return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        event.destinationId ?? '',
      )
        ? '/patient/medicines#reservations'
        : null;
    case 'APPOINTMENT':
      // Deliberately never coupled to Task 0035 candidate routes.
      return null;
    default:
      return null;
  }
}
