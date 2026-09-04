import { randomUUID } from 'node:crypto';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  assertActiveTenantMembership,
  assertNoSensitiveValues,
  assertTrustedProviderAccess,
  appendExactTenantUserAudit,
  findTenantScoped,
  requireTrustedTenantActor,
} from '@medsphere/security';
import { AuditWriter } from '../audit/audit-writer.service';
import { isInfrastructureTestEnabled, requireEnv } from '../auth/testing/infrastructure-test-gate';
import { PrismaService } from '../prisma/prisma.service';

const describeInfra = isInfrastructureTestEnabled() ? describe : describe.skip;

if (isInfrastructureTestEnabled()) {
  requireEnv('DATABASE_URL');
}

describeInfra('Task 0020 common cross-vertical security framework (DB integration)', () => {
  const prisma = new PrismaService();
  const auditWriter = new AuditWriter();

  const tenantAId = randomUUID();
  const tenantBId = randomUUID();
  const userAId = randomUUID();
  const userBId = randomUUID();
  const membershipAId = randomUUID();
  const membershipBId = randomUUID();
  const providerAId = randomUUID();
  const providerBId = randomUUID();

  const actorA = { tenantId: tenantAId, membershipId: membershipAId, userId: userAId };
  const actorB = { tenantId: tenantBId, membershipId: membershipBId, userId: userBId };

  beforeAll(async () => {
    await prisma.client.tenant.createMany({
      data: [
        { id: tenantAId, name: 'Task 0020 Tenant A', slug: `t0020-a-${tenantAId}` },
        { id: tenantBId, name: 'Task 0020 Tenant B', slug: `t0020-b-${tenantBId}` },
      ],
    });
    await prisma.client.user.createMany({
      data: [
        {
          id: userAId,
          email: `t0020-a-${userAId}@medsphere.test`,
          passwordHash: 'integration-only-placeholder',
          firstName: 'A',
          lastName: 'User',
        },
        {
          id: userBId,
          email: `t0020-b-${userBId}@medsphere.test`,
          passwordHash: 'integration-only-placeholder',
          firstName: 'B',
          lastName: 'User',
        },
      ],
    });
    await prisma.client.tenantMembership.createMany({
      data: [
        {
          id: membershipAId,
          tenantId: tenantAId,
          userId: userAId,
          status: 'ACTIVE',
          joinedAt: new Date(),
        },
        {
          id: membershipBId,
          tenantId: tenantBId,
          userId: userBId,
          status: 'ACTIVE',
          joinedAt: new Date(),
        },
      ],
    });

    const providerFixture = (
      id: string,
      tenantId: string,
      businessName: string,
      suffix: string,
    ) => ({
      id,
      tenantId,
      providerType: 'PHARMACY' as const,
      businessName,
      ownerName: 'Owner',
      email: `provider-${suffix}-${id}@medsphere.test`,
      phone: '0000000000',
      address: 'Addr',
      city: 'Chennai',
      state: 'Tamil Nadu',
      country: 'India',
      postalCode: '600001',
      latitude: 13.0827,
      longitude: 80.2707,
      isVerified: true,
      isActive: true,
    });
    await prisma.client.provider.createMany({
      data: [
        providerFixture(providerAId, tenantAId, 'Task 0020 Pharmacy A', 'a'),
        providerFixture(providerBId, tenantBId, 'Task 0020 Pharmacy B', 'b'),
      ],
    });
    await prisma.client.membershipProviderAccess.create({
      data: {
        id: randomUUID(),
        tenantId: tenantAId,
        membershipId: membershipAId,
        providerId: providerAId,
      },
    });
  });

  afterAll(async () => {
    await prisma.client.$disconnect();
  });

  it('resolves a tenant-owned resource through a tenant-qualified compound lookup', async () => {
    const provider = await findTenantScoped<{ id: string; tenantId: string }>(
      prisma.client.provider,
      tenantAId,
      providerAId,
      'Provider',
    );
    expect(provider.id).toBe(providerAId);
    expect(provider.tenantId).toBe(tenantAId);
  });

  it('rejects a cross-tenant resource UUID (IDOR/BOLA) with a uniform NotFound', async () => {
    // providerBId is a valid UUID in tenant B; authenticated in tenant A it must
    // be indistinguishable from a missing provider.
    await expect(
      findTenantScoped(prisma.client.provider, tenantAId, providerBId, 'Provider'),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      findTenantScoped(prisma.client.provider, tenantBId, providerAId, 'Provider'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('enforces active membership ownership for the trusted tenant actor', async () => {
    await expect(assertActiveTenantMembership(prisma.client, actorA)).resolves.toBeUndefined();

    // mismatched membership/user must fail closed even when both exist.
    await expect(
      assertActiveTenantMembership(prisma.client, {
        tenantId: tenantAId,
        membershipId: membershipAId,
        userId: userBId,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    // a membership from tenant B cannot be asserted in tenant A.
    await expect(
      assertActiveTenantMembership(prisma.client, {
        tenantId: tenantAId,
        membershipId: membershipBId,
        userId: userBId,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects suspended/revoked memberships for protected tenant operations', async () => {
    await prisma.client.tenantMembership.update({
      where: { id: membershipBId },
      data: { status: 'SUSPENDED' },
    });
    await expect(assertActiveTenantMembership(prisma.client, actorB)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await prisma.client.tenantMembership.update({
      where: { id: membershipBId },
      data: { status: 'REVOKED' },
    });
    await expect(assertActiveTenantMembership(prisma.client, actorB)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await prisma.client.tenantMembership.update({
      where: { id: membershipBId },
      data: { status: 'ACTIVE' },
    });
  });

  it('enforces the live membership-to-provider assignment boundary', async () => {
    await expect(
      assertTrustedProviderAccess(prisma.client, actorA, providerAId),
    ).resolves.toBeUndefined();
    // provider B exists but is not assigned to actor A's membership; the shared
    // helper's default NotFound conceals cross-tenant provider existence.
    await expect(assertTrustedProviderAccess(prisma.client, actorA, providerBId)).rejects.toThrow(
      'Provider not found',
    );
  });

  it('records TENANT_USER audit with the exact trusted actorUserId (Task 0019 preserved)', async () => {
    const resourceId = randomUUID();
    await appendExactTenantUserAudit(prisma.client, auditWriter, actorA, {
      eventType: 'inventory.reservation.created',
      outcome: 'SUCCEEDED',
      resourceType: 'MedicineReservation',
      resourceId,
      metadata: { itemCount: 1, totalQuantity: 2, expiresAt: new Date().toISOString() },
      request: { requestId: 'task-0020-exact-actor' },
    });

    const event = await prisma.client.auditEvent.findFirstOrThrow({
      where: { resourceId, eventType: 'inventory.reservation.created' },
    });
    expect(event.tenantId).toBe(tenantAId);
    expect(event.actorMembershipId).toBe(membershipAId);
    expect(event.actorUserId).toBe(userAId);
    expect(event.scope).toBe('TENANT');
    expect(event.actorType).toBe('TENANT_USER');
  });

  it('rejects sensitive client-controlled values (mass assignment)', () => {
    expect(() =>
      assertNoSensitiveValues({ productName: 'Paracetamol', quantity: 4 }),
    ).not.toThrow();
    for (const bad of [
      { userId: 'x' },
      { tenantId: 'x' },
      { membershipId: 'x' },
      { role: 'admin' },
    ]) {
      expect(() => assertNoSensitiveValues(bad)).toThrow(/Sensitive server-managed field/);
    }
  });

  it('fails closed on an incomplete trusted tenant actor', () => {
    expect(() =>
      requireTrustedTenantActor({ tenantId: tenantAId, membershipId: membershipAId }),
    ).toThrow(/Trusted tenant actor identity/);
  });
});
