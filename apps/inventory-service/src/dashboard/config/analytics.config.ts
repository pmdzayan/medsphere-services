/**
 * Inventory analytics configuration with configurable thresholds.
 * These values can be made dynamic (e.g. from env vars or DB config).
 */
export const ANALYTICS_CONFIG = {
  /** Stock health thresholds */
  STOCK: {
    /** Multiplier of minimumStockLevel to consider overstocked */
    OVERSTOCK_MULTIPLIER: 3,
    /** Minimum turnover rate to consider fast-moving */
    FAST_MOVING_TURNOVER: 5,
    /** Maximum turnover rate to consider slow-moving */
    SLOW_MOVING_TURNOVER: 1,
    /** Days without movement to consider dead stock */
    DEAD_STOCK_DAYS: 90,
  },

  /** Expiry windows (in days) */
  EXPIRY_WINDOWS: {
    TODAY: 0,
    WITHIN_7_DAYS: 7,
    WITHIN_30_DAYS: 30,
    WITHIN_60_DAYS: 60,
  },

  /** Default page sizes */
  PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
} as const;
