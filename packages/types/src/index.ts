/**
 * Shared cross-service contracts only — no business logic lives here.
 * Deliberately minimal: real domain types (Patient, Pharmacy, InventoryItem,
 * Reservation, ...) belong to their own architecture-review pass per
 * PROJECT_RULES.md #8, not fabricated ahead of that design work.
 */

// Mirrors PROJECT_RULES.md #9's minimum role set for RBAC.
export enum Role {
  PATIENT = 'patient',
  PHARMACY_STAFF = 'pharmacy_staff',
  PHARMACY_ADMIN = 'pharmacy_admin',
  HOSPITAL_STAFF = 'hospital_staff',
  HOSPITAL_ADMIN = 'hospital_admin',
  SUPPLIER = 'supplier',
  PLATFORM_ADMIN = 'platform_admin',
}

export interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    requestId?: string;
  };
}
