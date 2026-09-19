import { describe, expect, it } from 'vitest';
import {
  isAssignPharmacyStaffRequest,
  isPharmacyStaffCatalogue,
  isPharmacyStaffMember,
  isProviderAccessAssignment,
} from './pharmacy-staff-contract';

const membershipId = '84f42a34-0b52-4c77-8c38-0c88c1b69be8';
const providerId = '65b329f4-790d-4d17-97e0-e86924f1812a';
const roleId = 'adc57b4b-b3f3-4fb9-99d0-371752a42d93';
const staffMember = {
  membershipId,
  firstName: 'Asha',
  lastName: 'Rao',
  email: 'asha@example.test',
  status: 'ACTIVE',
  roles: [{ id: roleId, name: 'Staff Pharmacist' }],
};

describe('pharmacy staff boundary contracts', () => {
  it('accepts the exact bounded staff member and catalogue shapes', () => {
    expect(isPharmacyStaffMember(staffMember)).toBe(true);
    expect(isPharmacyStaffCatalogue({ data: [staffMember], total: 1, limit: 100, offset: 0 })).toBe(
      true,
    );
  });

  it('rejects extra keys, malformed identifiers, and oversized collections', () => {
    expect(isPharmacyStaffMember({ ...staffMember, tenantId: 'attacker' })).toBe(false);
    expect(isPharmacyStaffMember({ ...staffMember, membershipId: 'not-a-uuid' })).toBe(false);
    expect(
      isPharmacyStaffCatalogue({
        data: Array.from({ length: 101 }, () => staffMember),
        total: 101,
        limit: 100,
        offset: 0,
      }),
    ).toBe(false);
    expect(isPharmacyStaffCatalogue({ data: [staffMember], total: 1, limit: 0, offset: 0 })).toBe(
      false,
    );
  });

  it('accepts only an exact canonical membership assignment request', () => {
    expect(isAssignPharmacyStaffRequest({ membershipId })).toBe(true);
    expect(isAssignPharmacyStaffRequest({ membershipId: 'garbage' })).toBe(false);
    expect(isAssignPharmacyStaffRequest({ membershipId, providerId })).toBe(false);
  });

  it('validates the provider-access receipt exactly', () => {
    const assignment = {
      membershipId,
      providerId,
      businessName: 'AIM Pharmacy',
      providerType: 'PHARMACY',
      isActive: true,
    };
    expect(isProviderAccessAssignment(assignment)).toBe(true);
    expect(isProviderAccessAssignment({ ...assignment, tenantId: 'attacker' })).toBe(false);
    expect(isProviderAccessAssignment({ ...assignment, providerId: 'garbage' })).toBe(false);
  });
});
