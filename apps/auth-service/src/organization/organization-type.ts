/**
 * Bounded V1 organization types a normal user may select during public
 * registration. Deliberately a plain, hand-maintained constant (mirrors
 * the Prisma `OrganizationType` enum in schema.prisma exactly) rather
 * than importing the generated Prisma enum here: this keeps DTO
 * validation resolvable without the generated Prisma client, and the
 * frontend (which cannot import from @medsphere/database at all) needs
 * its own mirrored copy regardless -- see
 * apps/web/src/lib/organization-types.ts.
 *
 * Adding a new organization type is a deliberate code + schema change
 * (a new Prisma migration for the enum, plus updating this list and its
 * frontend mirror) -- never a free-form string a client can supply.
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

/** Organization types that represent a real healthcare/business organization -- i.e. everything except the personal-account marker. */
export const HEALTHCARE_ORGANIZATION_TYPES = ORGANIZATION_TYPES.filter(
  (type) => type !== 'NONE',
) as readonly Exclude<OrganizationType, 'NONE'>[];

export function isOrganizationType(value: string): value is OrganizationType {
  return (ORGANIZATION_TYPES as readonly string[]).includes(value);
}

export function isHealthcareOrganizationType(
  value: OrganizationType,
): value is Exclude<OrganizationType, 'NONE'> {
  return value !== 'NONE';
}
