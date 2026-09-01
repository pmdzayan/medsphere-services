/**
 * Bounded consent categories (Task 0013). Mirrors the Prisma
 * ConsentCategory enum exactly, as a plain constant so DTO validation
 * and the frontend do not need the generated Prisma client to reference
 * these values -- same rationale as Task 0010/0012's hand-mirrored
 * enums in this codebase.
 */
export const CONSENT_CATEGORIES = [
  'LOCATION_USE',
  'NOTIFICATIONS_RESERVATIONS',
  'NOTIFICATIONS_OPERATIONAL',
] as const;

export type ConsentCategory = (typeof CONSENT_CATEGORIES)[number];

export function isConsentCategory(value: string): value is ConsentCategory {
  return (CONSENT_CATEGORIES as readonly string[]).includes(value);
}

export const CONSENT_STATUSES = ['GRANTED', 'WITHDRAWN'] as const;
export type ConsentStatus = (typeof CONSENT_STATUSES)[number];

export function isConsentStatus(value: string): value is ConsentStatus {
  return (CONSENT_STATUSES as readonly string[]).includes(value);
}

/** Bounded, non-identifying source tags a consent event may be recorded from. */
export const CONSENT_SOURCES = [
  'settings_privacy_page',
  'nearby_search_prompt',
  'notification_prompt',
] as const;
export type ConsentSource = (typeof CONSENT_SOURCES)[number];

export function isConsentSource(value: string): value is ConsentSource {
  return (CONSENT_SOURCES as readonly string[]).includes(value);
}

/** Current disclosure-text version per category -- bump when a category's explanation copy materially changes. */
export const CONSENT_CATEGORY_VERSION: Record<ConsentCategory, number> = {
  LOCATION_USE: 1,
  NOTIFICATIONS_RESERVATIONS: 1,
  NOTIFICATIONS_OPERATIONAL: 1,
};
