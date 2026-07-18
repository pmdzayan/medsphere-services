/**
 * Expiry configuration constants.
 * These values can be made dynamic (e.g. from env vars or DB config)
 * without changing business logic.
 */
export const EXPIRY_CONFIG = {
  /** Days threshold for "expiring soon" status */
  EXPIRING_SOON_DAYS: 30,

  /** Days thresholds for expiry windows */
  WINDOWS: {
    EXPIRING_TODAY: 0,
    EXPIRING_WITHIN_7_DAYS: 7,
    EXPIRING_WITHIN_30_DAYS: 30,
    EXPIRING_WITHIN_60_DAYS: 60,
  },

  /** Maximum page size for paginated queries */
  MAX_PAGE_SIZE: 100,

  /** Default page size */
  DEFAULT_PAGE_SIZE: 20,
} as const;

export type ExpiryWindow = (typeof EXPIRY_CONFIG.WINDOWS)[keyof typeof EXPIRY_CONFIG.WINDOWS];
