/**
 * Candidate Task 0037 (PROVISIONAL). See
 * docs/candidates/0037-patient-medical-timeline-provisional.md
 */
export const PATIENT_TIMELINE_DESTINATION_TYPES = [
  'NONE',
  'RESERVATION',
  'APPOINTMENT',
  'SETTINGS',
] as const;
export type PatientTimelineDestinationTypeValue =
  (typeof PATIENT_TIMELINE_DESTINATION_TYPES)[number];

/** Patient-safe public shape -- never recipientUserId, sourceType, or sourceEventId. */
export interface PatientTimelineEvent {
  readonly id: string;
  readonly eventType: string;
  readonly title: string;
  readonly summary: string;
  readonly destinationType: PatientTimelineDestinationTypeValue;
  readonly destinationId: string | null;
  readonly occurredAt: string;
  readonly createdAt: string;
}

export interface ListPatientTimelineResponse {
  readonly items: PatientTimelineEvent[];
  readonly nextCursor: string | null;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const EVENT_TYPE_MAX_LENGTH = 80;
const TITLE_MAX_LENGTH = 160;
const SUMMARY_MAX_LENGTH = 500;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

function isIsoTimestamp(value: unknown): value is string {
  return (
    typeof value === 'string' && ISO_DATE_PATTERN.test(value) && !Number.isNaN(Date.parse(value))
  );
}

function isDestinationType(value: unknown): value is PatientTimelineDestinationTypeValue {
  return (
    typeof value === 'string' &&
    (PATIENT_TIMELINE_DESTINATION_TYPES as readonly string[]).includes(value)
  );
}

/**
 * Mirrors the backend's own validateDestination() exactly (mirroring
 * the same correction applied in candidate Task 0036): NONE must
 * carry no destinationId; SETTINGS must be the fixed known token
 * "privacy"; RESERVATION/APPOINTMENT must be a valid UUID. Anything
 * else -- a raw URL, a protocol-relative path, an arbitrary token --
 * is rejected, so the Timeline UI can trust this contract before
 * constructing internal navigation.
 */
function isValidDestinationPairing(destinationType: unknown, destinationId: unknown): boolean {
  if (destinationType === 'NONE') return destinationId === null;
  if (destinationType === 'SETTINGS') return destinationId === 'privacy';
  if (destinationType === 'RESERVATION' || destinationType === 'APPOINTMENT') {
    return isUuid(destinationId);
  }
  return false;
}

/**
 * Exact-shape validator: rejects a payload with any unexpected extra
 * property, so a backend/BFF change that accidentally leaks an
 * internal field (recipientUserId, sourceType, sourceEventId) fails
 * closed on the frontend rather than silently passing it through.
 */
export function isPatientTimelineEvent(value: unknown): value is PatientTimelineEvent {
  if (!isRecord(value)) return false;
  const allowedKeys = [
    'id',
    'eventType',
    'title',
    'summary',
    'destinationType',
    'destinationId',
    'occurredAt',
    'createdAt',
  ];
  const actualKeys = Object.keys(value);
  if (actualKeys.length !== allowedKeys.length) return false;
  if (!actualKeys.every((key) => allowedKeys.includes(key))) return false;

  if (!(
    isUuid(value.id) &&
    typeof value.eventType === 'string' &&
    value.eventType.trim().length > 0 &&
    value.eventType.length <= EVENT_TYPE_MAX_LENGTH &&
    typeof value.title === 'string' &&
    value.title.trim().length > 0 &&
    value.title.length <= TITLE_MAX_LENGTH &&
    typeof value.summary === 'string' &&
    value.summary.trim().length > 0 &&
    value.summary.length <= SUMMARY_MAX_LENGTH &&
    isDestinationType(value.destinationType) &&
    isIsoTimestamp(value.occurredAt) &&
    isIsoTimestamp(value.createdAt)
  )) {
    return false;
  }

  return isValidDestinationPairing(value.destinationType, value.destinationId);
}

export function isListPatientTimelineResponse(
  value: unknown,
): value is ListPatientTimelineResponse {
  if (!isRecord(value)) return false;
  const allowedKeys = ['items', 'nextCursor'];
  const actualKeys = Object.keys(value);
  if (actualKeys.length !== allowedKeys.length) return false;
  if (!actualKeys.every((key) => allowedKeys.includes(key))) return false;

  return (
    Array.isArray(value.items) &&
    // Bounded to the backend's own maximum page size -- a response
    // claiming more items than the backend could ever legitimately
    // return is rejected as contract-invalid, not silently accepted.
    value.items.length <= 50 &&
    value.items.every(isPatientTimelineEvent) &&
    (value.nextCursor === null ||
      (typeof value.nextCursor === 'string' &&
        value.nextCursor.length > 0 &&
        value.nextCursor.length <= 200))
  );
}
