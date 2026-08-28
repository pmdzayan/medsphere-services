/**
 * Bounded V1 organization types a normal user may select during public
 * registration. Mirrors apps/auth-service/src/organization/organization-type.ts
 * exactly -- the frontend cannot import from the backend package, so
 * this is the frontend's own hand-kept-in-sync copy. Adding a new type
 * is a deliberate code change on both sides, never a free-form string.
 */
export const ORGANIZATION_TYPES = [
  'PHARMACY',
  'HOSPITAL',
  'LABORATORY',
  'CLINIC',
  'BLOOD_BANK',
  'SUPPLIER',
  'NONE',
] as const;

export type OrganizationType = (typeof ORGANIZATION_TYPES)[number];

export const HEALTHCARE_ORGANIZATION_TYPES = ORGANIZATION_TYPES.filter(
  (type) => type !== 'NONE',
) as readonly Exclude<OrganizationType, 'NONE'>[];
