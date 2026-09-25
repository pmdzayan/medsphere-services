import { randomUUID } from 'node:crypto';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { AuthenticatedIdentity } from '../auth/auth.types';
import { ProviderDomainService } from './provider-domain.service';

const actor: AuthenticatedIdentity = {
  userId: randomUUID(),
  membershipId: randomUUID(),
  tenantId: randomUUID(),
  sessionId: randomUUID(),
  tokenId: randomUUID(),
  securityVersion: 1,
};

function facilityDto(providerType: 'HOSPITAL' | 'CLINIC' | 'LABORATORY') {
  return {
    providerType,
    businessName: 'Task 0051 Facility',
    ownerName: 'Facility Owner',
    email: 'facility@example.invalid',
    phone: '1000000000',
    address: '1 Provider Road',
    city: 'City',
    state: 'State',
    country: 'Country',
    postalCode: '600001',
    latitude: 12.9,
    longitude: 80.2,
  };
}

function buildHarness(options?: {
  organizationType?: string;
  coarseAccess?: boolean;
  activeProfessionalMembership?: boolean;
  matchingLocation?: boolean;
}) {
  const providerId = randomUUID();
  const locationId = randomUUID();
  const professionalMembershipId = randomUUID();
  const organizationType = options?.organizationType ?? 'HOSPITAL';

  const transaction = {
    tenantMembership: {
      findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        if ('id' in where) return { id: actor.membershipId };
        if ('userId' in where) {
          return options?.activeProfessionalMembership === false
            ? null
            : { id: professionalMembershipId };
        }
        return null;
      }),
    },
    tenant: {
      findFirst: jest.fn().mockResolvedValue({ organizationType }),
    },
    provider: {
      create: jest.fn().mockResolvedValue({
        id: providerId,
        providerType: 'HOSPITAL',
        businessName: 'Task 0051 Facility',
        isVerified: false,
        isActive: true,
      }),
      findFirst: jest.fn().mockResolvedValue({ id: providerId }),
    },
    providerLocation: {
      create: jest.fn().mockResolvedValue({
        id: locationId,
        code: 'PRIMARY',
        name: 'Task 0051 Facility',
        address: '1 Provider Road',
        city: 'City',
        state: 'State',
        country: 'Country',
        postalCode: '600001',
        latitude: 12.9,
        longitude: 80.2,
        isPrimary: true,
        isActive: true,
        version: 1,
      }),
      findFirst: jest
        .fn()
        .mockResolvedValue(options?.matchingLocation === false ? null : { id: locationId }),
    },
    providerDepartment: {
      create: jest.fn().mockResolvedValue({
        id: randomUUID(),
        locationId,
        code: 'GENERAL',
        name: 'General',
        isActive: true,
        version: 1,
      }),
    },
    providerProfessionalProfile: {
      create: jest.fn().mockResolvedValue({ id: randomUUID() }),
      findFirst: jest.fn(),
    },
    membershipProviderAccess: {
      findFirst: jest
        .fn()
        .mockResolvedValue(options?.coarseAccess === false ? null : { id: randomUUID() }),
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn(),
    },
    $queryRaw: jest.fn(),
  };

  const client = {
    ...transaction,
    providerDepartment: transaction.providerDepartment,
    providerProfessionalProfile: transaction.providerProfessionalProfile,
    $transaction: jest.fn(async (operation: (tx: typeof transaction) => Promise<unknown>) =>
      operation(transaction),
    ),
  };
  const audit = {
    appendTenantUser: jest.fn().mockResolvedValue(undefined),
  };
  const service = new ProviderDomainService({ client } as never, audit as never);
  return { service, transaction, client, audit, providerId, locationId, professionalMembershipId };
}

describe('ProviderDomainService — Task 0051', () => {
  it.each([
    ['HOSPITAL', 'HOSPITAL'],
    ['CLINIC', 'CLINIC'],
    ['LABORATORY', 'LABORATORY'],
  ] as const)(
    'allows a %s tenant to create only its matching facility provider type',
    async (organizationType, providerType) => {
      const h = buildHarness({ organizationType });
      h.transaction.provider.create.mockResolvedValueOnce({
        id: h.providerId,
        providerType,
        businessName: 'Task 0051 Facility',
        isVerified: false,
        isActive: true,
      });

      await expect(serviceCall(h.service, providerType)).resolves.toEqual(
        expect.objectContaining({ providerType, isVerified: false }),
      );
      expect(h.transaction.providerLocation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            providerId: h.providerId,
            code: 'PRIMARY',
            isPrimary: true,
          }),
        }),
      );
      expect(h.audit.appendTenantUser).toHaveBeenCalledWith(
        h.transaction,
        expect.objectContaining({
          actorMembershipId: actor.membershipId,
          actorUserId: actor.userId,
          eventType: 'provider.domain.created',
          resourceId: h.providerId,
        }),
      );
    },
  );

  it('rejects a cross-domain facility type even for an active tenant administrator', async () => {
    const h = buildHarness({ organizationType: 'HOSPITAL' });
    await expect(serviceCall(h.service, 'LABORATORY')).rejects.toThrow(ForbiddenException);
    expect(h.transaction.provider.create).not.toHaveBeenCalled();
    expect(h.audit.appendTenantUser).not.toHaveBeenCalled();
  });

  it('requires the doctor to already be an active user membership in the same tenant', async () => {
    const h = buildHarness({
      organizationType: 'CLINIC',
      activeProfessionalMembership: false,
    });
    await expect(
      h.service.createProfessional(actor, {
        userId: randomUUID(),
        displayName: 'Task Doctor',
        registrationNumber: 'REG-0051',
        registrationAuthority: 'Medical Council',
        email: 'doctor@example.invalid',
        phone: '1000000001',
        address: '2 Provider Road',
        city: 'City',
        state: 'State',
        country: 'Country',
        postalCode: '600002',
        latitude: 12.8,
        longitude: 80.1,
      }),
    ).rejects.toThrow(NotFoundException);
    expect(h.transaction.provider.create).not.toHaveBeenCalled();
  });

  it('fails closed when a department location does not belong to the assigned provider', async () => {
    const h = buildHarness({ coarseAccess: true, matchingLocation: false });
    await expect(
      h.service.createDepartment(actor, h.providerId, {
        locationId: randomUUID(),
        code: 'GENERAL',
        name: 'General',
      }),
    ).rejects.toThrow(NotFoundException);
    expect(h.transaction.providerDepartment.create).not.toHaveBeenCalled();
  });

  it('fails closed before facility reads when coarse provider access is absent', async () => {
    const h = buildHarness({ coarseAccess: false });
    await expect(h.service.listLocations(actor, h.providerId)).rejects.toThrow(NotFoundException);
  });
});

function serviceCall(
  service: ProviderDomainService,
  providerType: 'HOSPITAL' | 'CLINIC' | 'LABORATORY',
) {
  return service.createFacility(actor, facilityDto(providerType));
}
