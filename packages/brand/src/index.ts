/**
 * Consumer-facing product identity. The @medsphere package scope is an
 * intentionally retained internal compatibility namespace; it is not the
 * product name rendered to users.
 */
export const BRAND = Object.freeze({
  shortName: 'AIM',
  fullName: 'All In Medico',
  accessibleName: 'AIM — All In Medico',
  applicationTitle: 'AIM — All In Medico',
} as const);

export type BrandConfiguration = typeof BRAND;
