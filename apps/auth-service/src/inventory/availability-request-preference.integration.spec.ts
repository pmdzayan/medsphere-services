/**
 * Task 0027 real-PostgreSQL preference persistence / isolation proof.
 */
import { NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AuditWriter } from '../audit/audit-writer.service';
import { isInfrastructureTestEnabled, requireEnv } from '../auth/testing/infrastructure-test-gate';
import { PrismaService } from '../prisma/prisma.service';
import { AvailabilityRequestPreferenceService } from './availability-request-preference.service';

const infrastructure = isInfrastructureTestEnabled() ? describe : describe.skip;

if (isInfrastructureTestEnabled()) {
  requireEnv('DATABASE_URL');
}

infrastructure('AvailabilityRequestPreferenceService - Task 0027 real PostgreSQL', () => {
  const prisma = new PrismaService();
  const service = new AvailabilityRequestPreferenceService(prisma, new AuditWriter());

  const tenantId = randomUUID();
  const otherTenantId = randomUUID();
  const userId = randomUUID();
  const membershipId = randomUUID();
  const providerId = randomUUID();
  const otherTenantProviderId = randomUUID();

  const actor = {
    tenantId,
    membershipId,
    userId,
  };

  beforeAll(async () => {
    await prisma.client.tenant.createMany({
      data: [
        {
          id: tenantId,
          name: 'Task0027 preference tenant',
          slug: `task0027-preference-${tenantId}`,
          organizationType: 'PHARMACY',
        },
        {
          id: otherTenantId,
          name: 'Task0027 other tenant',
          slug: `task0027-preference-other-${otherTenantId}`,
          organizationType: 'PHARMACY',
        },
      ],
    });

    await prisma.client.user.create({
      data: {
        id: userId,
        email: `${userId}@medsphere.test`,
        passwordHash: 'integration-only-placeholder',
        firstName: 'Task0027',
        lastName: 'Administrator',
      },
    });

    await prisma.client.tenantMembership.create({
      data: {
        id: membershipId,
        tenantId,
        userId,
        status: 'ACTIVE',
        joinedAt: new Date(),
      },
    });

    await prisma.client.provider.createMany({
      data: [
        {
          id: providerId,
          tenantId,
          providerType: 'PHARMACY',
          businessName: 'Task0027 Preference Pharmacy',
          ownerName: 'Fixture Owner',
          email: `${providerId}@medsphere.test`,
          phone: '0000027001',
          address: 'Fixture address',
          city: 'Chennai',
          state: 'Tamil Nadu',
          country: 'India',
          postalCode: '600001',
          latitude: 13.0827,
          longitude: 80.2707,
          isVerified: true,
        },
        {
          id: otherTenantProviderId,
          tenantId: otherTenantId,
          providerType: 'PHARMACY',
          businessName: 'Task0027 Other Tenant Pharmacy',
          ownerName: 'Other Fixture Owner',
          email: `${otherTenantProviderId}@medsphere.test`,
          phone: '0000027002',
          address: 'Other fixture address',
          city: 'Chennai',
          state: 'Tamil Nadu',
          country: 'India',
          postalCode: '600002',
          latitude: 13.0827,
          longitude: 80.2707,
          isVerified: true,
        },
      ],
    });

    await prisma.client.membershipProviderAccess.create({
      data: {
        id: randomUUID(),
        tenantId,
        membershipId,
        providerId,
      },
    });
  });

  afterAll(async () => prisma.client.$disconnect());

  it('fails closed when the assigned pharmacy has no persisted preference row', async () => {
    await expect(service.get(actor, providerId)).resolves.toEqual({
      configured: false,
      liveRequestsEnabled: false,
      timezone: null,
      quietHoursStartMinute: null,
      quietHoursEndMinute: null,
    });

    await expect(
      prisma.client.pharmacyAvailabilityRequestPreference.count({
        where: { providerId },
      }),
    ).resolves.toBe(0);
  });

  it('persists valid overnight quiet hours and exact-user durable audit atomically', async () => {
    const requestId = `task0027-${randomUUID()}`;

    await expect(
      service.configure({
        actor,
        providerId,
        liveRequestsEnabled: true,
        timezone: '  Asia/Kolkata  ',
        quietHoursStartMinute: 1320,
        quietHoursEndMinute: 420,
        request: {
          requestId,
          ipAddress: '127.0.0.1',
          userAgent: 'jest-task-0027-postgresql',
        },
      }),
    ).resolves.toEqual({
      configured: true,
      liveRequestsEnabled: true,
      timezone: 'Asia/Kolkata',
      quietHoursStartMinute: 1320,
      quietHoursEndMinute: 420,
    });

    const [preference, audit] = await Promise.all([
      prisma.client.pharmacyAvailabilityRequestPreference.findUniqueOrThrow({
        where: { providerId },
      }),
      prisma.client.auditEvent.findFirstOrThrow({
        where: {
          tenantId,
          actorMembershipId: membershipId,
          actorUserId: userId,
          eventType: 'inventory.availability-request.preference.configured',
          resourceType: 'PharmacyAvailabilityRequestPreference',
          resourceId: providerId,
          requestId,
        },
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      }),
    ]);

    expect(preference).toMatchObject({
      providerId,
      tenantId,
      liveRequestsEnabled: true,
      timezone: 'Asia/Kolkata',
      quietHoursStartMinute: 1320,
      quietHoursEndMinute: 420,
    });

    expect(audit).toMatchObject({
      tenantId,
      actorMembershipId: membershipId,
      actorUserId: userId,
      eventType: 'inventory.availability-request.preference.configured',
      outcome: 'SUCCEEDED',
      resourceType: 'PharmacyAvailabilityRequestPreference',
      resourceId: providerId,
      requestId,
    });

    expect(audit.metadata).toEqual({
      liveRequestsEnabled: true,
      timezone: 'Asia/Kolkata',
      quietHoursStartMinute: 1320,
      quietHoursEndMinute: 420,
    });

    await expect(service.get(actor, providerId)).resolves.toEqual({
      configured: true,
      liveRequestsEnabled: true,
      timezone: 'Asia/Kolkata',
      quietHoursStartMinute: 1320,
      quietHoursEndMinute: 420,
    });
  });

  it('updates the existing provider preference instead of creating a second authority row', async () => {
    await expect(
      service.configure({
        actor,
        providerId,
        liveRequestsEnabled: false,
        timezone: 'UTC',
        quietHoursStartMinute: null,
        quietHoursEndMinute: null,
      }),
    ).resolves.toEqual({
      configured: true,
      liveRequestsEnabled: false,
      timezone: 'UTC',
      quietHoursStartMinute: null,
      quietHoursEndMinute: null,
    });

    const [count, preference] = await Promise.all([
      prisma.client.pharmacyAvailabilityRequestPreference.count({
        where: { providerId },
      }),
      prisma.client.pharmacyAvailabilityRequestPreference.findUniqueOrThrow({
        where: { providerId },
      }),
    ]);

    expect(count).toBe(1);
    expect(preference).toMatchObject({
      providerId,
      tenantId,
      liveRequestsEnabled: false,
      timezone: 'UTC',
      quietHoursStartMinute: null,
      quietHoursEndMinute: null,
    });
  });

  it('conceals and rejects a provider from another tenant even when its UUID is known', async () => {
    await expect(
      service.configure({
        actor,
        providerId: otherTenantProviderId,
        liveRequestsEnabled: true,
        timezone: 'Asia/Kolkata',
        quietHoursStartMinute: 1320,
        quietHoursEndMinute: 420,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    await expect(
      prisma.client.pharmacyAvailabilityRequestPreference.count({
        where: { providerId: otherTenantProviderId },
      }),
    ).resolves.toBe(0);

    await expect(
      prisma.client.auditEvent.count({
        where: {
          tenantId,
          resourceId: otherTenantProviderId,
          eventType: 'inventory.availability-request.preference.configured',
        },
      }),
    ).resolves.toBe(0);
  });

  it('has the Task 0027 least-privilege configure permission in the applied database', async () => {
    await expect(
      prisma.client.permission.count({
        where: {
          name: 'inventory.availability-requests.configure',
        },
      }),
    ).resolves.toBe(1);
  });
});
