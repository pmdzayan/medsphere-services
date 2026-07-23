/**
 * Marketplace domain enums.
 *
 * These mirror the Prisma schema enums for type-safe usage in the
 * marketplace-service without importing Prisma-generated types directly.
 */

export enum CartStatus {
  ACTIVE = 'ACTIVE',
  CHECKOUT = 'CHECKOUT',
  COMPLETED = 'COMPLETED',
  ABANDONED = 'ABANDONED',
}

export enum MarketplaceOrderStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  RESERVED = 'RESERVED',
  APPROVAL_REQUIRED = 'APPROVAL_REQUIRED',
  APPROVED = 'APPROVED',
  PAID = 'PAID',
  FULFILLED = 'FULFILLED',
  CANCELLED = 'CANCELLED',
  REFUNDED = 'REFUNDED',
}

export enum FulfillmentStrategy {
  SINGLE_PHARMACY = 'SINGLE_PHARMACY',
  SPLIT = 'SPLIT',
  SUBSTITUTION = 'SUBSTITUTION',
}

export enum DeliveryStatus {
  PENDING = 'PENDING',
  ASSIGNED = 'ASSIGNED',
  IN_TRANSIT = 'IN_TRANSIT',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
}

export enum ProductVisibility {
  PUBLIC = 'PUBLIC',
  PRIVATE = 'PRIVATE',
  UNLISTED = 'UNLISTED',
}

/**
 * Search fields supported by the universal medicine search.
 */
export enum SearchField {
  BRAND = 'brand',
  GENERIC = 'generic',
  SKU = 'sku',
  BARCODE = 'barcode',
  CATEGORY = 'category',
}

/**
 * Optimization criteria for intelligent fulfillment.
 */
export enum OptimizationCriteria {
  LOWEST_PRICE = 'lowest_price',
  FASTEST_DELIVERY = 'fastest_delivery',
  HIGHEST_RATING = 'highest_rating',
  MINIMUM_PHARMACY_COUNT = 'minimum_pharmacy_count',
}
