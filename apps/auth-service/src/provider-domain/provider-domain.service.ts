import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  assertActiveTenantMembership,
  requireActiveTenantActorWithProvider,
} from '@medsphere/security';
import type { TrustedTenantActor } from '@medsphere/security';
import type { RequestMetadata } from '../auth/auth.types';
import { AuditWriter } from '../audit/audit-writer.service';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CreateFacilityProviderDto,
  CreateProfessionalProviderDto,
  CreateProviderDepartmentDto,
  CreateProviderLocationDto,
} from './dto/provider-domain.dto';

const DOMAIN_PROVIDER_TYPES = ['HOSPITAL', 'CLINIC', 'LABORATORY', 'DOCTOR'] as const;
type DomainProviderType = (typeof DOMAIN_PROVIDER_TYPES)[number];

@Injectable()
export class ProviderDomainService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditWriter,
  ) {}

  async listAssigned(actor: TrustedTenantActor) {
    await assertActiveTenantMembership(this.prisma.client, actor);
    const rows = await this.prisma.client.membershipProviderAccess.findMany({
      where: {
        tenantId: actor.tenantId,
        membershipId: actor.membershipId,
        membership: {
          userId: actor.userId,
          status: 'ACTIVE',
          deletedAt: null,
        },
        provider: {
          providerType: { in: [...DOMAIN_PROVIDER_TYPES] },
          deletedAt: null,
        },
      },
      select: {
        provider: {
          select: {
            id: true,
            providerType: true,
            businessName: true,
            isVerified: true,
            isActive: true,
          },
        },
      },
      orderBy: [{ provider: { businessName: 'asc' } }, { providerId: 'asc' }],
    });
    return rows.map(({ provider }) => provider);
  }

  async createFacility(
    actor: TrustedTenantActor,
    dto: CreateFacilityProviderDto,
    request: RequestMetadata = {},
  ) {
    return this.prisma.client.$transaction(async (tx) => {
      await assertActiveTenantMembership(tx, actor);
      const tenant = await tx.tenant.findFirst({
        where: { id: actor.tenantId, isActive: true, deletedAt: null },
        select: { organizationType: true },
      });
      if (!tenant || tenant.organizationType !== dto.providerType) {
        throw new ForbiddenException('Provider type is not permitted for this organization');
      }

      const provider = await tx.provider.create({
        data: {
          tenantId: actor.tenantId,
          providerType: dto.providerType,
          businessName: dto.businessName,
          ownerName: dto.ownerName,
          email: dto.email,
          phone: dto.phone,
          address: dto.address,
          city: dto.city,
          state: dto.state,
          country: dto.country,
          postalCode: dto.postalCode,
          latitude: dto.latitude,
          longitude: dto.longitude,
          isVerified: false,
          isActive: true,
        },
        select: {
          id: true,
          providerType: true,
          businessName: true,
          isVerified: true,
          isActive: true,
        },
      });
      const location = await tx.providerLocation.create({
        data: {
          id: randomUUID(),
          tenantId: actor.tenantId,
          providerId: provider.id,
          code: 'PRIMARY',
          name: dto.businessName,
          address: dto.address,
          city: dto.city,
          state: dto.state,
          country: dto.country,
          postalCode: dto.postalCode,
          latitude: dto.latitude,
          longitude: dto.longitude,
          isPrimary: true,
          isActive: true,
        },
        select: { id: true },
      });
      await tx.membershipProviderAccess.createMany({
        data: [
          { tenantId: actor.tenantId, membershipId: actor.membershipId, providerId: provider.id },
        ],
        skipDuplicates: true,
      });
      await this.audit.appendTenantUser(tx, {
        tenantId: actor.tenantId,
        actorMembershipId: actor.membershipId,
        actorUserId: actor.userId,
        eventType: 'provider.domain.created',
        outcome: 'SUCCEEDED',
        resourceType: 'Provider',
        resourceId: provider.id,
        metadata: {
          providerId: provider.id,
          providerType: provider.providerType,
          locationId: location.id,
        },
        request,
      });
      return provider;
    });
  }

  async createProfessional(
    actor: TrustedTenantActor,
    dto: CreateProfessionalProviderDto,
    request: RequestMetadata = {},
  ) {
    return this.prisma.client.$transaction(async (tx) => {
      await assertActiveTenantMembership(tx, actor);
      const tenant = await tx.tenant.findFirst({
        where: { id: actor.tenantId, isActive: true, deletedAt: null },
        select: { organizationType: true },
      });
      if (!tenant || !['HOSPITAL', 'CLINIC'].includes(tenant.organizationType)) {
        throw new ForbiddenException('Professional providers require a hospital or clinic tenant');
      }

      const professionalMembership = await tx.tenantMembership.findFirst({
        where: {
          tenantId: actor.tenantId,
          userId: dto.userId,
          status: 'ACTIVE',
          deletedAt: null,
          user: { status: 'ACTIVE', deletedAt: null },
        },
        select: { id: true },
      });
      if (!professionalMembership) {
        throw new NotFoundException('Active professional membership not found');
      }

      const provider = await tx.provider.create({
        data: {
          tenantId: actor.tenantId,
          providerType: 'DOCTOR',
          businessName: dto.displayName,
          ownerName: dto.displayName,
          email: dto.email,
          phone: dto.phone,
          address: dto.address,
          city: dto.city,
          state: dto.state,
          country: dto.country,
          postalCode: dto.postalCode,
          latitude: dto.latitude,
          longitude: dto.longitude,
          isVerified: false,
          isActive: true,
        },
        select: {
          id: true,
          providerType: true,
          businessName: true,
          isVerified: true,
          isActive: true,
        },
      });

      const location = await tx.providerLocation.create({
        data: {
          id: randomUUID(),
          tenantId: actor.tenantId,
          providerId: provider.id,
          code: 'PRIMARY',
          name: dto.displayName,
          address: dto.address,
          city: dto.city,
          state: dto.state,
          country: dto.country,
          postalCode: dto.postalCode,
          latitude: dto.latitude,
          longitude: dto.longitude,
          isPrimary: true,
          isActive: true,
        },
        select: { id: true },
      });

      await tx.providerProfessionalProfile.create({
        data: {
          tenantId: actor.tenantId,
          providerId: provider.id,
          userId: dto.userId,
          registrationNumber: dto.registrationNumber,
          registrationAuthority: dto.registrationAuthority,
          registrationExpiryDate: dto.registrationExpiryDate
            ? new Date(dto.registrationExpiryDate)
            : null,
          primarySpecialty: dto.primarySpecialty ?? null,
        },
      });

      await tx.membershipProviderAccess.createMany({
        data: [
          { tenantId: actor.tenantId, membershipId: actor.membershipId, providerId: provider.id },
          {
            tenantId: actor.tenantId,
            membershipId: professionalMembership.id,
            providerId: provider.id,
          },
        ],
        skipDuplicates: true,
      });

      await this.audit.appendTenantUser(tx, {
        tenantId: actor.tenantId,
        actorMembershipId: actor.membershipId,
        actorUserId: actor.userId,
        eventType: 'provider.domain.created',
        outcome: 'SUCCEEDED',
        resourceType: 'Provider',
        resourceId: provider.id,
        metadata: {
          providerId: provider.id,
          providerType: 'DOCTOR',
          locationId: location.id,
        },
        request,
      });
      return provider;
    });
  }

  async listLocations(actor: TrustedTenantActor, providerId: string) {
    await requireActiveTenantActorWithProvider(this.prisma.client, actor, providerId);
    return this.prisma.client.providerLocation.findMany({
      where: { tenantId: actor.tenantId, providerId, deletedAt: null },
      select: {
        id: true,
        code: true,
        name: true,
        address: true,
        city: true,
        state: true,
        country: true,
        postalCode: true,
        latitude: true,
        longitude: true,
        isPrimary: true,
        isActive: true,
        version: true,
      },
      orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }, { id: 'asc' }],
    });
  }

  async createLocation(
    actor: TrustedTenantActor,
    providerId: string,
    dto: CreateProviderLocationDto,
    request: RequestMetadata = {},
  ) {
    try {
      return await this.prisma.client.$transaction(async (tx) => {
        await requireActiveTenantActorWithProvider(tx, actor, providerId);
        const location = await tx.providerLocation.create({
          data: {
            tenantId: actor.tenantId,
            providerId,
            code: dto.code,
            name: dto.name,
            address: dto.address,
            city: dto.city,
            state: dto.state,
            country: dto.country,
            postalCode: dto.postalCode,
            latitude: dto.latitude,
            longitude: dto.longitude,
            isPrimary: false,
            isActive: true,
          },
          select: {
            id: true,
            code: true,
            name: true,
            address: true,
            city: true,
            state: true,
            country: true,
            postalCode: true,
            latitude: true,
            longitude: true,
            isPrimary: true,
            isActive: true,
            version: true,
          },
        });
        await this.audit.appendTenantUser(tx, {
          tenantId: actor.tenantId,
          actorMembershipId: actor.membershipId,
          actorUserId: actor.userId,
          eventType: 'provider.location.created',
          outcome: 'SUCCEEDED',
          resourceType: 'ProviderLocation',
          resourceId: location.id,
          metadata: { providerId, locationId: location.id },
          request,
        });
        return location;
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new ConflictException('Provider location code already exists');
      }
      throw error;
    }
  }

  async listDepartments(actor: TrustedTenantActor, providerId: string) {
    await requireActiveTenantActorWithProvider(this.prisma.client, actor, providerId);
    return this.prisma.client.providerDepartment.findMany({
      where: { tenantId: actor.tenantId, providerId, deletedAt: null },
      select: {
        id: true,
        locationId: true,
        code: true,
        name: true,
        isActive: true,
        version: true,
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
  }

  async createDepartment(
    actor: TrustedTenantActor,
    providerId: string,
    dto: CreateProviderDepartmentDto,
    request: RequestMetadata = {},
  ) {
    try {
      return await this.prisma.client.$transaction(async (tx) => {
        await requireActiveTenantActorWithProvider(tx, actor, providerId);
        const provider = await tx.provider.findFirst({
          where: {
            id: providerId,
            tenantId: actor.tenantId,
            deletedAt: null,
            isActive: true,
            providerType: { in: ['HOSPITAL', 'CLINIC', 'LABORATORY'] },
          },
          select: { id: true },
        });
        if (!provider) throw new NotFoundException('Active facility provider not found');

        const location = await tx.providerLocation.findFirst({
          where: {
            id: dto.locationId,
            tenantId: actor.tenantId,
            providerId,
            deletedAt: null,
            isActive: true,
          },
          select: { id: true },
        });
        if (!location) throw new NotFoundException('Active provider location not found');

        const department = await tx.providerDepartment.create({
          data: {
            tenantId: actor.tenantId,
            providerId,
            locationId: dto.locationId,
            code: dto.code,
            name: dto.name,
            isActive: true,
          },
          select: {
            id: true,
            locationId: true,
            code: true,
            name: true,
            isActive: true,
            version: true,
          },
        });
        await this.audit.appendTenantUser(tx, {
          tenantId: actor.tenantId,
          actorMembershipId: actor.membershipId,
          actorUserId: actor.userId,
          eventType: 'provider.department.created',
          outcome: 'SUCCEEDED',
          resourceType: 'ProviderDepartment',
          resourceId: department.id,
          metadata: {
            providerId,
            locationId: dto.locationId,
            departmentId: department.id,
          },
          request,
        });
        return department;
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new ConflictException('Provider department code already exists');
      }
      throw error;
    }
  }

  async getProfessionalProfile(actor: TrustedTenantActor, providerId: string) {
    await requireActiveTenantActorWithProvider(this.prisma.client, actor, providerId);
    const provider = await this.prisma.client.provider.findFirst({
      where: {
        id: providerId,
        tenantId: actor.tenantId,
        providerType: 'DOCTOR',
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!provider) throw new NotFoundException('Professional provider not found');

    const profile = await this.prisma.client.providerProfessionalProfile.findFirst({
      where: { tenantId: actor.tenantId, providerId },
      select: {
        providerId: true,
        userId: true,
        registrationNumber: true,
        registrationAuthority: true,
        registrationExpiryDate: true,
        primarySpecialty: true,
        version: true,
      },
    });
    if (!profile) throw new NotFoundException('Professional profile not found');
    return profile;
  }
}

function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}
