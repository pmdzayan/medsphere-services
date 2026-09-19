export const PATIENT_NOTIFICATION_CATEGORIES = [
  'ACCOUNT',
  'SECURITY',
  'RESERVATION',
  'APPOINTMENT',
  'SYSTEM',
] as const;
export type PatientNotificationCategoryValue = (typeof PATIENT_NOTIFICATION_CATEGORIES)[number];

export const PATIENT_NOTIFICATION_DESTINATION_TYPES = [
  'NONE',
  'RESERVATION',
  'APPOINTMENT',
  'SETTINGS',
] as const;
export type PatientNotificationDestinationTypeValue =
  (typeof PATIENT_NOTIFICATION_DESTINATION_TYPES)[number];

/** Patient-safe public shape -- never recipientUserId, sourceType, or sourceEventId. */
export interface PatientNotification {
  readonly id: string;
  readonly category: PatientNotificationCategoryValue;
  readonly title: string;
  readonly message: string;
  readonly destinationType: PatientNotificationDestinationTypeValue;
  readonly destinationId: string | null;
  readonly readAt: string | null;
  readonly createdAt: string;
}

export interface ListPatientNotificationsResponse {
  readonly items: PatientNotification[];
  readonly nextCursor: string | null;
  readonly unreadCount: number;
}

export interface MarkAllReadResponse {
  readonly updatedCount: number;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

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

function isCategory(value: unknown): value is PatientNotificationCategoryValue {
  return (
    typeof value === 'string' &&
    (PATIENT_NOTIFICATION_CATEGORIES as readonly string[]).includes(value)
  );
}

function isDestinationType(value: unknown): value is PatientNotificationDestinationTypeValue {
  return (
    typeof value === 'string' &&
    (PATIENT_NOTIFICATION_DESTINATION_TYPES as readonly string[]).includes(value)
  );
}

/**
 * Exact-shape validator: rejects a payload with any unexpected extra
 * property, so a backend/BFF change that accidentally leaks an
 * internal field (recipientUserId, sourceType, sourceEventId) fails
 * closed on the frontend rather than silently passing it through.
 * destination pairing is validated exactly against what the backend's
 * own validateDestination() actually enforces, so the Activity Center
 * UI can trust this contract before constructing internal navigation
 * -- an arbitrary string is never accepted as a destinationId.
 */
export function isPatientNotification(value: unknown): value is PatientNotification {
  if (!isRecord(value)) return false;
  const allowedKeys = [
    'id',
    'category',
    'title',
    'message',
    'destinationType',
    'destinationId',
    'readAt',
    'createdAt',
  ];
  const actualKeys = Object.keys(value);
  if (actualKeys.length !== allowedKeys.length) return false;
  if (!actualKeys.every((key) => allowedKeys.includes(key))) return false;

  if (!(
    isUuid(value.id) &&
    isCategory(value.category) &&
    typeof value.title === 'string' &&
    value.title.length > 0 &&
    value.title.length <= 160 &&
    typeof value.message === 'string' &&
    value.message.length > 0 &&
    value.message.length <= 500 &&
    isDestinationType(value.destinationType) &&
    (value.readAt === null || isIsoTimestamp(value.readAt)) &&
    isIsoTimestamp(value.createdAt)
  )) {
    return false;
  }

  return isValidDestinationPairing(value.destinationType, value.destinationId);
}

/**
 * Mirrors the backend's own validateDestination() exactly: NONE must
 * carry no destinationId; SETTINGS must be the fixed known token
 * "privacy"; RESERVATION/APPOINTMENT must be a valid UUID (matching
 * the authoritative MedicineReservation.id shape and the generic
 * UUID-v4 pattern used for Task 0035's provisional Appointment.id --
 * a shape check only, never a code dependency on that candidate).
 * Anything else -- a raw URL, a protocol-relative path, an arbitrary
 * token -- is rejected.
 */
function isValidDestinationPairing(destinationType: unknown, destinationId: unknown): boolean {
  if (destinationType === 'NONE') {
    return destinationId === null;
  }
  if (destinationType === 'SETTINGS') {
    return destinationId === 'privacy';
  }
  if (destinationType === 'RESERVATION' || destinationType === 'APPOINTMENT') {
    return isUuid(destinationId);
  }
  return false;
}

export function isListPatientNotificationsResponse(
  value: unknown,
): value is ListPatientNotificationsResponse {
  if (!isRecord(value)) return false;
  const allowedKeys = ['items', 'nextCursor', 'unreadCount'];
  const actualKeys = Object.keys(value);
  if (actualKeys.length !== allowedKeys.length) return false;
  if (!actualKeys.every((key) => allowedKeys.includes(key))) return false;

  return (
    Array.isArray(value.items) &&
    // Bounded to the backend's own maximum page size -- a response
    // claiming more items than the backend could ever legitimately
    // return is rejected as contract-invalid, not silently accepted.
    value.items.length <= 50 &&
    value.items.every(isPatientNotification) &&
    (value.nextCursor === null ||
      (typeof value.nextCursor === 'string' &&
        value.nextCursor.length > 0 &&
        value.nextCursor.length <= 200)) &&
    isSafeNonNegativeInteger(value.unreadCount)
  );
}

export function isMarkAllReadResponse(value: unknown): value is MarkAllReadResponse {
  if (!isRecord(value)) return false;
  const actualKeys = Object.keys(value);
  if (actualKeys.length !== 1 || actualKeys[0] !== 'updatedCount') return false;
  return isSafeNonNegativeInteger(value.updatedCount);
}

function isSafeNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
