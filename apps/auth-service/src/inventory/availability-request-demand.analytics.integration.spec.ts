/**
 * Task 0028 real-PostgreSQL integration proof.
 *
 * Seeds real rows (random UUID fixture IDs) and proves:
 * - provider/tenant isolation (cross-tenant rows never leak)
 * - multiple request statuses aggregate independently
 * - pharmacist confirmation outcomes map to evidence outcome counts
 * - deterministic aggregation and deterministic ordering
 * - bounded time filtering (server-derived window from `days`)
 * - no cross-tenant leakage
 * - the read is side-effect free (no new request/evidence/audit rows)
 *
 * Teardown only disconnects: `ProviderProductAvailabilityEvidence` and
 * `AuditEvent` are append-only (database triggers forbid DELETE/UPDATE), so
 * fixture rows are intentionally left behind with disposable random UUIDs and
 * reruns remain safe (the accepted repository integration-test pattern).
 */
import { NotFoundException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { isInfrastructureTestEnabled, requireEnv } from '../auth/testing/infrastructure-test-gate';
import { PrismaService } from '../prisma/prisma.service';
import { AvailabilityRequestDemandAnalyticsService } from './availability-request-demand.service';

const infrastructure = isInfrastructureTestEnabled() ? describe : describe.skip;

if (isInfrastructureTestEnabled()) {
  requireEnv('DATABASE_URL');
}

const DAY_MS = 24 * 60 * 60 * 1000;

infrastructure('AvailabilityRequestDemandAnalyticsService - Task 0028 real PostgreSQL', () => {
  const prisma = new PrismaService();
  const service = new AvailabilityRequestDemandAnalyticsService(prisma);

  const NOW = new Date();
  const NEW_DATE = new Date();
  const hourAgo = (hours: number) => new Date(NOW.getTime() - hours * 60 * 60 * 1000);

  const tenantId = randomUUID();
  const otherTenantId = randomUUID();
  const userId = randomUUID();
  const membershipId = randomUUID();
  const responderUserId = randomUUID();
  const responderMembershipId = randomUUID();
  const providerId = randomUUID();
  const otherTenantProviderId = randomUUID();
  const hospitalProviderId = randomUUID();
  const productIds = [randomUUID(), randomUUID(), randomUUID()];

  const actor = { tenantId, membershipId, userId };
  const dedupKey = () => `${randomUUID()}:${randomUUID()}`;
  const commandHash = (seed: string) => createHash('sha256').update(seed).digest('hex');

  const providerFixture = (
    id: string,
    tenant: string,
    providerType: 'PHARMACY' | 'HOSPITAL',
    phone: string,
  ) => ({
    id,
    tenantId: tenant,
    providerType,
    businessName: `Task0028 ${providerType} ${phone}`,
    ownerName: 'Fixture Owner',
    email: `${id}@medsphere.test`,
    phone,
    address: 'Fixture address',
    city: 'Chennai',
    state: 'Tamil Nadu',
    country: 'India',
    postalCode: '600001',
    latitude: 13.0827,
    longitude: 80.2707,
    isVerified: true,
  });

  beforeAll(async () => {
    await prisma.client.tenant.createMany({
      data: [
        {
          id: tenantId,
          name: 'Task0028 demand tenant',
          slug: `task0028-demand-${tenantId}`,
          organizationType: 'PHARMACY',
        },
        {
          id: otherTenantId,
          name: 'Task0028 other tenant',
          slug: `task0028-demand-other-${otherTenantId}`,
          organizationType: 'PHARMACY',
        },
      ],
    });

    await prisma.client.user.createMany({
      data: [
        {
          id: userId,
          email: `${userId}@medsphere.test`,
          passwordHash: 'integration-only-placeholder',
          firstName: 'Task0028',
          lastName: 'Administrator',
        },
        {
          id: responderUserId,
          email: `${responderUserId}@medsphere.test`,
          passwordHash: 'integration-only-placeholder',
          firstName: 'Task0028',
          lastName: 'Responder',
        },
      ],
    });

    await prisma.client.tenantMembership.createMany({
      data: [
        {
          id: membershipId,
          tenantId,
          userId,
          status: 'ACTIVE',
          joinedAt: NEW_DATE,
        },
        {
          id: responderMembershipId,
          tenantId,
          userId: responderUserId,
          status: 'ACTIVE',
          joinedAt: NEW_DATE,
        },
      ],
    });

    await prisma.client.provider.createMany({
      data: [
        providerFixture(providerId, tenantId, 'PHARMACY', '0000028001'),
        providerFixture(otherTenantProviderId, otherTenantId, 'PHARMACY', '0000028002'),
        providerFixture(hospitalProviderId, tenantId, 'HOSPITAL', '0000028003'),
      ],
    });

    await prisma.client.membershipProviderAccess.createMany({
      data: [
        { tenantId, membershipId, providerId },
        { tenantId, membershipId, providerId: hospitalProviderId },
      ],
    });

    await prisma.client.product.createMany({
      data: [
        {
          id: productIds[0],
          name: 'Amoxicillin',
          genericName: 'amoxicillin',
          brand: 'A',
          strength: '250mg',
          dosageForm: 'CAPSULE',
          manufacturer: 'Alpha Labs',
          category: 'MEDICINE',
        },
        {
          id: productIds[1],
          name: 'Paracetamol',
          genericName: 'paracetamol',
          brand: 'B',
          strength: '500mg',
          dosageForm: 'TABLET',
          manufacturer: 'Beta Labs',
          category: 'MEDICINE',
        },
        {
          id: productIds[2],
          name: 'Cetirizine',
          genericName: 'cetirizine',
          brand: 'C',
          strength: '10mg',
          dosageForm: 'TABLET',
          manufacturer: 'Gamma Labs',
          category: 'MEDICINE',
        },
      ],
    });
  }, 60_000);

  // Requests are seeded with explicit `requestedAt` values so the server-derived
  // window boundary can be proven against a deterministic `now`.
  const inWindow = hourAgo(48); // 2 days ago -> inside a 90-day window
  const oldOutsideWindow = new Date(NOW.getTime() - 95 * DAY_MS); // 95 days ago -> outside
  const futureOutsideWindow = new Date(NOW.getTime() + 2 * DAY_MS);

  const reqPendingP1 = randomUUID();
  const reqRespondedP1 = randomUUID();
  const reqExpiredP1 = randomUUID();
  const reqRespondedP2A = randomUUID();
  const reqRespondedP2B = randomUUID();
  const reqRespondedP3 = randomUUID();
  const reqOldP1 = randomUUID();
  const reqOldP2A = randomUUID();
  const reqFutureP1 = randomUUID();
  const reqCrossTenantP1 = randomUUID();

  beforeAll(async () => {
    // -- Tenant A / provider A in-window requests -----------------------------
    await prisma.client.availabilityRequest.createMany({
      data: [
        {
          id: reqPendingP1,
          tenantId,
          providerId,
          productId: productIds[0],
          status: 'PENDING',
          activeDedupKey: dedupKey(),
          requestedAt: inWindow,
          expiresAt: new Date(inWindow.getTime() + 15 * 60_000),
        },
        {
          id: reqRespondedP1,
          tenantId,
          providerId,
          productId: productIds[0],
          status: 'RESPONDED',
          activeDedupKey: null,
          requestedAt: inWindow,
          expiresAt: new Date(inWindow.getTime() + 15 * 60_000),
          respondedAt: new Date(inWindow.getTime() + 5 * 60_000),
        },
        {
          id: reqExpiredP1,
          tenantId,
          providerId,
          productId: productIds[0],
          status: 'EXPIRED',
          activeDedupKey: null,
          requestedAt: new Date(inWindow.getTime() - 60 * 60_000),
          expiresAt: new Date(inWindow.getTime() - 45 * 60_000),
        },
        {
          id: reqRespondedP2A,
          tenantId,
          providerId,
          productId: productIds[1],
          status: 'RESPONDED',
          activeDedupKey: null,
          requestedAt: inWindow,
          expiresAt: new Date(inWindow.getTime() + 15 * 60_000),
          respondedAt: new Date(inWindow.getTime() + 3 * 60_000),
        },
        {
          id: reqRespondedP2B,
          tenantId,
          providerId,
          productId: productIds[1],
          status: 'RESPONDED',
          activeDedupKey: null,
          requestedAt: inWindow,
          expiresAt: new Date(inWindow.getTime() + 15 * 60_000),
          respondedAt: new Date(inWindow.getTime() + 6 * 60_000),
        },
        {
          id: reqRespondedP3,
          tenantId,
          providerId,
          productId: productIds[2],
          status: 'RESPONDED',
          activeDedupKey: null,
          requestedAt: inWindow,
          expiresAt: new Date(inWindow.getTime() + 15 * 60_000),
          respondedAt: new Date(inWindow.getTime() + 2 * 60_000),
        },
      ],
    });

    // -- Out-of-window and cross-tenant rows (must never be counted) ----------
    await prisma.client.availabilityRequest.createMany({
      data: [
        {
          id: reqOldP1,
          tenantId,
          providerId,
          productId: productIds[0],
          status: 'PENDING',
          activeDedupKey: dedupKey(),
          requestedAt: oldOutsideWindow,
          expiresAt: new Date(oldOutsideWindow.getTime() + 15 * 60_000),
        },
        {
          id: reqOldP2A,
          tenantId,
          providerId,
          productId: productIds[1],
          status: 'RESPONDED',
          activeDedupKey: null,
          requestedAt: oldOutsideWindow,
          expiresAt: new Date(oldOutsideWindow.getTime() + 15 * 60_000),
          respondedAt: new Date(oldOutsideWindow.getTime() + 5 * 60_000),
        },
        {
          id: reqFutureP1,
          tenantId,
          providerId,
          productId: productIds[0],
          status: 'PENDING',
          activeDedupKey: dedupKey(),
          requestedAt: futureOutsideWindow,
          expiresAt: new Date(futureOutsideWindow.getTime() + 15 * 60_000),
        },
        {
          id: reqCrossTenantP1,
          tenantId: otherTenantId,
          providerId: otherTenantProviderId,
          productId: productIds[0],
          status: 'PENDING',
          activeDedupKey: dedupKey(),
          requestedAt: inWindow,
          expiresAt: new Date(inWindow.getTime() + 15 * 60_000),
        },
      ],
    });

    // -- Pharmacist-confirmation evidence -------------------------------------
    await prisma.client.providerProductAvailabilityEvidence.createMany({
      data: [
        {
          id: randomUUID(),
          tenantId,
          providerId,
          productId: productIds[0],
          availabilityRequestId: reqRespondedP1,
          source: 'PHARMACIST_CONFIRMATION',
          outcome: 'AVAILABLE',
          confirmedAt: inWindow,
          validUntil: new Date(inWindow.getTime() + 30 * 60_000),
          retryAfterAt: null,
          responderMembershipId,
          responderUserId,
          idempotencyKey: `task0028-evidence-available-${randomUUID()}`,
          commandHash: commandHash(`available-${reqRespondedP1}`),
        },
        {
          id: randomUUID(),
          tenantId,
          providerId,
          productId: productIds[1],
          availabilityRequestId: reqRespondedP2A,
          source: 'PHARMACIST_CONFIRMATION',
          outcome: 'UNAVAILABLE',
          confirmedAt: inWindow,
          validUntil: new Date(inWindow.getTime() + 30 * 60_000),
          retryAfterAt: null,
          responderMembershipId,
          responderUserId,
          idempotencyKey: `task0028-evidence-unavailable-${randomUUID()}`,
          commandHash: commandHash(`unavailable-${reqRespondedP2A}`),
        },
        {
          id: randomUUID(),
          tenantId,
          providerId,
          productId: productIds[1],
          availabilityRequestId: reqRespondedP2B,
          source: 'PHARMACIST_CONFIRMATION',
          outcome: 'CHECK_LATER',
          confirmedAt: inWindow,
          validUntil: null,
          retryAfterAt: new Date(inWindow.getTime() + 10 * 60_000),
          responderMembershipId,
          responderUserId,
          idempotencyKey: `task0028-evidence-checklater-${randomUUID()}`,
          commandHash: commandHash(`checklater-${reqRespondedP2B}`),
        },
        // Evidence for an OUT-OF-WINDOW request must never be counted.
        {
          id: randomUUID(),
          tenantId,
          providerId,
          productId: productIds[1],
          availabilityRequestId: reqOldP2A,
          source: 'PHARMACIST_CONFIRMATION',
          outcome: 'UNAVAILABLE',
          confirmedAt: oldOutsideWindow,
          validUntil: new Date(oldOutsideWindow.getTime() + 30 * 60_000),
          retryAfterAt: null,
          responderMembershipId,
          responderUserId,
          idempotencyKey: `task0028-evidence-old-unavailable-${randomUUID()}`,
          commandHash: commandHash(`old-unavailable-${reqOldP2A}`),
        },
      ],
    });
  }, 60_000);

  it('aggregates in-window requests per product with statuses and evidence outcomes', async () => {
    const result = await service.readDemand(
      actor as never,
      providerId,
      { days: 90, limit: 25 },
      { now: NOW },
    );

    expect(result.providerId).toBe(providerId);
    expect(result.window.days).toBe(90);

    expect(result.totals).toEqual({
      liveRequestCount: 6,
      pendingCount: 1,
      respondedCount: 4,
      expiredCount: 1,
    });

    const byId = new Map(result.products.map((item) => [item.productId, item]));
    expect(byId.get(productIds[0])).toMatchObject({
      name: 'Amoxicillin',
      strength: '250mg',
      dosageForm: 'CAPSULE',
      manufacturer: 'Alpha Labs',
      liveRequestCount: 3,
      pendingCount: 1,
      respondedCount: 1,
      expiredCount: 1,
      availableCount: 1,
      unavailableCount: 0,
      checkLaterCount: 0,
    });
    expect(byId.get(productIds[1])).toMatchObject({
      name: 'Paracetamol',
      liveRequestCount: 2,
      pendingCount: 0,
      respondedCount: 2,
      expiredCount: 0,
      availableCount: 0,
      unavailableCount: 1,
      checkLaterCount: 1,
    });
    expect(byId.get(productIds[2])).toMatchObject({
      name: 'Cetirizine',
      liveRequestCount: 1,
      respondedCount: 1,
      availableCount: 0,
      unavailableCount: 0,
      checkLaterCount: 0,
    });

    // Deterministic ordering: liveRequestCount DESC then display fields.
    expect(result.products.map((item) => item.productId)).toEqual([
      productIds[0],
      productIds[1],
      productIds[2],
    ]);
  });

  it('returns identical deterministic output on repeated reads', async () => {
    const first = await service.readDemand(
      actor as never,
      providerId,
      { days: 90, limit: 25 },
      { now: NOW },
    );
    const second = await service.readDemand(
      actor as never,
      providerId,
      { days: 90, limit: 25 },
      { now: NOW },
    );

    expect(second).toEqual(first);
  });

  it('enforces the bounded time window: a 1-day window observes nothing seeded 2 days ago', async () => {
    const result = await service.readDemand(
      actor as never,
      providerId,
      { days: 1, limit: 25 },
      { now: NOW },
    );

    expect(result.totals).toEqual({
      liveRequestCount: 0,
      pendingCount: 0,
      respondedCount: 0,
      expiredCount: 0,
    });
    expect(result.products).toEqual([]);
  });

  it('applies the bounded result limit after aggregation while totals stay complete', async () => {
    const result = await service.readDemand(
      actor as never,
      providerId,
      { days: 90, limit: 2 },
      { now: NOW },
    );

    expect(result.products).toHaveLength(2);
    expect(result.products.map((item) => item.productId)).toEqual([productIds[0], productIds[1]]);
    expect(result.totals.liveRequestCount).toBe(6);
  });

  it('does not leak cross-tenant, out-of-window, or future request ids', async () => {
    const result = await service.readDemand(
      actor as never,
      providerId,
      { days: 90, limit: 25 },
      { now: NOW },
    );

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(reqCrossTenantP1);
    expect(serialized).not.toContain(reqOldP1);
    expect(serialized).not.toContain(reqOldP2A);
    expect(serialized).not.toContain(reqFutureP1);
    expect(serialized).not.toContain(otherTenantProviderId);
    expect(serialized).not.toContain(hospitalProviderId);
  });

  it('rejects an accessible HOSPITAL provider (non-PHARMACY) fail closed', async () => {
    await expect(
      service.readDemand(actor as never, hospitalProviderId, { days: 90, limit: 25 }, { now: NOW }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects a provider the actor is not assigned to (cross-tenant access boundary)', async () => {
    await expect(
      service.readDemand(
        actor as never,
        otherTenantProviderId,
        { days: 90, limit: 25 },
        { now: NOW },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('is a side-effect-free read: it appends no requests, evidence, or audit rows', async () => {
    const baseline = await Promise.all([
      prisma.client.availabilityRequest.count({ where: { tenantId, providerId } }),
      prisma.client.providerProductAvailabilityEvidence.count({ where: { tenantId, providerId } }),
      prisma.client.auditEvent.count({
        where: { tenantId, resourceId: providerId },
      }),
    ]);

    await service.readDemand(actor as never, providerId, { days: 90, limit: 25 }, { now: NOW });

    const after = await Promise.all([
      prisma.client.availabilityRequest.count({ where: { tenantId, providerId } }),
      prisma.client.providerProductAvailabilityEvidence.count({ where: { tenantId, providerId } }),
      prisma.client.auditEvent.count({
        where: { tenantId, resourceId: providerId },
      }),
    ]);

    expect(after).toEqual(baseline);
  });

  afterAll(async () => prisma.client.$disconnect());
});
