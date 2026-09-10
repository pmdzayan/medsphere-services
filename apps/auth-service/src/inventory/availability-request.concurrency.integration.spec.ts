/**
 * Task 0026 CTO coverage correction.
 * Real-PostgreSQL response-vs-expiry terminal-transition concurrency proof.
 */
import { randomUUID } from 'node:crypto';
import { AuditWriter } from '../audit/audit-writer.service';
import { isInfrastructureTestEnabled, requireEnv } from '../auth/testing/infrastructure-test-gate';
import { PrismaService } from '../prisma/prisma.service';
import { AvailabilityRequestExpiryService } from './availability-request-expiry.service';
import { AvailabilityRequestService } from './availability-request.service';
import { InventoryEventWriter } from './inventory-event-writer';

const infrastructure = isInfrastructureTestEnabled() ? describe : describe.skip;
if (isInfrastructureTestEnabled()) requireEnv('DATABASE_URL');

infrastructure('Task 0026 response-vs-expiry real PostgreSQL concurrency', () => {
  const prisma = new PrismaService();
  const tenantId = randomUUID();
  const userId = randomUUID();
  const membershipId = randomUUID();
  const providerId = randomUUID();
  const productId = randomUUID();
  const requestId = randomUUID();
  const actor = { tenantId, userId, membershipId };

  const responses = new AvailabilityRequestService(
    prisma,
    new AuditWriter(),
    new InventoryEventWriter(),
    {} as never,
  );
  const expiry = new AvailabilityRequestExpiryService(prisma);

  beforeAll(async () => {
    await prisma.client.tenant.create({
      data: { id: tenantId, name: 'Task0026 concurrency tenant', slug: `task0026-${tenantId}` },
    });
    await prisma.client.user.create({
      data: {
        id: userId,
        email: `${userId}@medsphere.test`,
        passwordHash: 'integration-only-placeholder',
        firstName: 'Task0026',
        lastName: 'Responder',
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
    await prisma.client.provider.create({
      data: {
        id: providerId,
        tenantId,
        providerType: 'PHARMACY',
        businessName: 'Task0026 Concurrency Pharmacy',
        ownerName: 'Fixture Owner',
        email: `${providerId}@medsphere.test`,
        phone: '0000000000',
        address: 'Fixture address',
        city: 'Chennai',
        state: 'Tamil Nadu',
        country: 'India',
        postalCode: '600001',
        latitude: 13.0827,
        longitude: 80.2707,
        isVerified: true,
      },
    });
    await prisma.client.membershipProviderAccess.create({
      data: { id: randomUUID(), tenantId, membershipId, providerId },
    });
    await prisma.client.product.create({
      data: {
        id: productId,
        name: 'Task0026 concurrency medicine',
        brand: 'Fixture Brand',
        category: 'MEDICINE',
        manufacturer: 'Fixture Manufacturer',
        dosageForm: 'TABLET',
        strength: '10 mg',
      },
    });

    const requestedAt = new Date();
    await prisma.client.availabilityRequest.create({
      data: {
        id: requestId,
        tenantId,
        providerId,
        productId,
        status: 'PENDING',
        activeDedupKey: `${providerId}:${productId}`,
        requestedAt,
        expiresAt: new Date(requestedAt.getTime() + 60_000),
        version: 1,
      },
    });
  });

  afterAll(async () => prisma.client.$disconnect());

  it('allows exactly one terminal transition: pharmacist response or expiry, never both', async () => {
    const beforeExpiry = new Date();
    const forcedExpiryCutoff = new Date(beforeExpiry.getTime() + 120_000);

    const expireOne = (
      expiry as unknown as {
        expire(
          candidate: { id: string; tenantId: string },
          asOf: Date,
        ): Promise<'EXPIRED' | 'SKIPPED'>;
      }
    ).expire.bind(expiry);

    const [responseResult, expiryResult] = await Promise.allSettled([
      responses.respond(
        actor,
        providerId,
        requestId,
        {
          outcome: 'AVAILABLE',
          idempotencyKey: `task0026-concurrency-${randomUUID()}`,
          expectedVersion: 1,
        },
        {
          now: beforeExpiry,
          requestPolicy: {
            requestLifetimeMs: 15 * 60_000,
            confirmationValidityMs: 30 * 60_000,
            retryAfterMinimumMs: 5 * 60_000,
            retryAfterMaximumMs: 24 * 60 * 60_000,
          },
        },
      ),
      expireOne({ id: requestId, tenantId }, forcedExpiryCutoff),
    ]);

    const [request, evidenceCount] = await Promise.all([
      prisma.client.availabilityRequest.findUniqueOrThrow({ where: { id: requestId } }),
      prisma.client.providerProductAvailabilityEvidence.count({
        where: { tenantId, providerId, availabilityRequestId: requestId },
      }),
    ]);

    expect(['RESPONDED', 'EXPIRED']).toContain(request.status);

    if (request.status === 'RESPONDED') {
      expect(evidenceCount).toBe(1);
      expect(responseResult.status).toBe('fulfilled');
      if (expiryResult.status === 'fulfilled') {
        expect(expiryResult.value).toBe('SKIPPED');
      }
    } else {
      expect(request.status).toBe('EXPIRED');
      expect(evidenceCount).toBe(0);
      expect(expiryResult.status).toBe('fulfilled');
      if (expiryResult.status === 'fulfilled') {
        expect(expiryResult.value).toBe('EXPIRED');
      }
      expect(responseResult.status).toBe('rejected');
    }
  });
});
