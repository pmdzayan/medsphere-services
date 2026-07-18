/**
 * Availability configuration with configurable thresholds.
 * These values can be made dynamic (e.g. from env vars or DB config).
 */
export const AVAILABILITY_CONFIG = {
  /** Stock thresholds for availability status */
  STOCK: {
    /** Minimum quantity to be considered IN_STOCK */
    IN_STOCK_MINIMUM: 1,
    /** Maximum quantity to be considered LOW_STOCK (as multiplier of minimumStockLevel) */
    LOW_STOCK_MULTIPLIER: 1,
  },

  /** Default page size for paginated queries */
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
} as const;

export enum AvailabilityStatus {
  IN_STOCK = 'IN_STOCK',
  LOW_STOCK = 'LOW_STOCK',
  OUT_OF_STOCK = 'OUT_OF_STOCK',
  UNAVAILABLE = 'UNAVAILABLE',
}
