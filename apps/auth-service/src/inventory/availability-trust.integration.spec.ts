/**
 * Task 0025 - PostgreSQL availability trust & freshness integration tests.
 *
 * Exercises the real service/Prisma path: write-path evidence atomically
 * recorded by accepted inventory commands, canonical trust evaluation,
 * monotonic/out-of-order evidence guarantees, fail-closed source validation,
 * and tenant/provider isolation enforced by database FK scoping.
 *
 * Gated by RUN_AUTH_INFRASTRUCTURE_TESTS=true (see
 * auth/testing/infrastructure-test-gate.ts).
 */
import { randomUUID } from 'node:crypto';
import { AuditWriter } from '../audit/audit-writer.service';
import type { AuthenticatedIdentity } from '../auth/auth.types';
import { isInfrastructureTestEnabled, requireEnv } from '../auth/testing/infrastructure-test-gate';
import { PrismaService } from '../prisma/prisma.service';
import { AvailabilityEvidenceService } from './availability-evidence.service';
import { AvailabilityTrustEvaluator } from './availability-trust.evaluator';
import { AvailabilityTrustService } from './availability-trust.service';
import { DEFAULT_AVAILABILITY_FRESHNESS_POLICY } from './availability-freshness-policy';
import { InventoryCommandService } from './inventory-command.service';

const infrastructure = isInfrastructureTestEnabled() ? describe : describe.skip;
if (isInfrastructureTestEnabled()) requireEnv('DATABASE_URL');

infrastructure('Task 0025 PostgreSQL availability trust and freshness', () => {
  const prisma = new PrismaService();
  const evidenceService = new AvailabilityEvidenceService();
  const trustService = new AvailabilityTrustService(prisma, new AvailabilityTrustEvaluator());
  const commandService = new InventoryCommandService(prisma, new AuditWriter(), evidenceService);

  const tenantId = randomUUID();
  const userId = randomUUID();
  const membershipId = randomUUID();
  const providerId = randomUUID();
  const actor: AuthenticatedIdentity = {
    tenantId,
    userId,
    membershipId,
    sessionId: randomUUID(),
    tokenId: randomUUID(),
    securityVersion: 1,
  };

  let inventoryId: string;
  let productId: string;
  beforeAll(async () => {
    await prisma.client.tenant.create({
      data: { id: tenantId, name: 'Task 0025 trust tenant', slug: `t0025-${tenantId}` },
    });
    await prisma.client.user.create({
      data: {
        id: userId,
        email: `${userId}@medsphere.test`,
        passwordHash: 'integration-only-placeholder',
        firstName: 'Availability',
        lastName: 'Operator',
      },
    });
    await prisma.client.tenantMembership.create({
      data: { id: membershipId, tenantId, userId, status: 'ACTIVE', joinedAt: new Date() },
    });
    await prisma.client.provider.create({
      data: {
        id: providerId,
        tenantId,
        providerType: 'PHARMACY',
        businessName: 'Task 0025 Pharmacy',
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
    productId = randomUUID();
    await prisma.client.product.create({
      data: {
        id: productId,
        name: 'Task 0025 Medicine',
        brand: 'Fixture Brand',
        category: 'MEDICINE',
        manufacturer: 'Fixture Manufacturer',
        dosageForm: 'TABLET',
        strength: '10 mg',
      },
    });
    await prisma.client.membershipProviderAccess.create({
      data: { id: randomUUID(), tenantId, membershipId, providerId },
    });
    const configured = await commandService.configureInventory({
      actor,
      providerId,
      productId,
      sellingPrice: '50.00',
      mrp: '60.00',
      discountPercentage: '0.00',
      taxPercentage: '5.00',
      minimumStockLevel: 1,
      isVisible: true,
      idempotencyKey: `configure-${randomUUID()}`,
    });
    inventoryId = configured.inventoryId;
  });

  afterAll(async () => {
    await prisma.client.$disconnect();
  });
  describe('write-path evidence and trust classification', () => {
    it('batch receipt records fresh evidence and evaluates AVAILABLE', async () => {
      const received = await commandService.receiveBatch({
        actor,
        providerId,
        productId,
        batchNumber: `FRESH-${randomUUID()}`,
        expiryDate: new Date('2030-01-01T00:00:00.000Z'),
        quantity: 20,
        purchasePrice: '10.00',
        sellingPrice: '12.00',
        idempotencyKey: `receive-fresh-${randomUUID()}`,
      });
      await expect(
        prisma.client.batchStockObservation.count({
          where: { tenantId, batchId: received.batchId },
        }),
      ).resolves.toBe(1);

      const evaluation = await trustService.evaluateProviderProduct(
        tenantId,
        providerId,
        productId,
        { policy: DEFAULT_AVAILABILITY_FRESHNESS_POLICY },
      );
      expect(evaluation.state).toBe('AVAILABLE');
      expect(evaluation.availableQuantity).toBe(20);
      expect(evaluation.reasonCode).toBe('ELIGIBLE_QUANTITY_FRESH');
    });

    it('idempotent retry of the same batch receipt does not duplicate evidence', async () => {
      const idempotencyKey = `receive-idem-${randomUUID()}`;
      const batchNumber = `IDEM-${randomUUID()}`;
      const received = await commandService.receiveBatch({
        actor,
        providerId,
        productId,
        batchNumber,
        expiryDate: new Date('2030-02-01T00:00:00.000Z'),
        quantity: 10,
        purchasePrice: '10.00',
        sellingPrice: '12.00',
        idempotencyKey,
      });
      const before = await prisma.client.batchStockObservation.count({
        where: { tenantId, batchId: received.batchId },
      });
      const replayed = await commandService.receiveBatch({
        actor,
        providerId,
        productId,
        batchNumber,
        expiryDate: new Date('2030-02-01T00:00:00.000Z'),
        quantity: 10,
        purchasePrice: '10.00',
        sellingPrice: '12.00',
        idempotencyKey,
      });
      expect(replayed.replayed).toBe(true);
      await expect(
        prisma.client.batchStockObservation.count({
          where: { tenantId, batchId: received.batchId },
        }),
      ).resolves.toBe(before);
    });

    it('generic stock adjustment does not refresh physical-stock observation evidence', async () => {
      const received = await commandService.receiveBatch({
        actor,
        providerId,
        productId,
        batchNumber: `ADJ-${randomUUID()}`,
        expiryDate: new Date('2030-03-01T00:00:00.000Z'),
        quantity: 20,
        purchasePrice: '10.00',
        sellingPrice: '12.00',
        idempotencyKey: `receive-adj-${randomUUID()}`,
      });
      const before = await prisma.client.batchStockObservation.findMany({
        where: { tenantId, batchId: received.batchId },
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      });
      expect(before).toHaveLength(1);

      await commandService.adjustBatch({
        actor,
        providerId,
        batchId: received.batchId,
        expectedVersion: 1,
        delta: -3,
        idempotencyKey: `adjust-${randomUUID()}`,
        reason: 'Task 0025 regression adjustment',
      });

      const after = await prisma.client.batchStockObservation.findMany({
        where: { tenantId, batchId: received.batchId },
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      });
      expect(after).toHaveLength(1);
      expect(after[0]?.id).toBe(before[0]?.id);
      expect(after[0]?.observedOnHandQuantity).toBe(20);

      const evaluation = await trustService.evaluateProviderProduct(
        tenantId,
        providerId,
        productId,
        { policy: DEFAULT_AVAILABILITY_FRESHNESS_POLICY },
      );
      expect(evaluation.state).toBe('AVAILABLE');
    });
    it('stale evidence with positive quantity evaluates CONFIRMATION_REQUIRED', async () => {
      // Isolated product so no other batch of this product is fresh.
      const isolatedProductId = await createIsolatedProduct();
      await commandService.configureInventory({
        actor,
        providerId,
        productId: isolatedProductId,
        sellingPrice: '50.00',
        mrp: '60.00',
        discountPercentage: '0.00',
        taxPercentage: '5.00',
        minimumStockLevel: 1,
        isVisible: true,
        idempotencyKey: `configure-isolated-${randomUUID()}`,
      });
      await commandService.receiveBatch({
        actor,
        providerId,
        productId: isolatedProductId,
        batchNumber: `STALE-${randomUUID()}`,
        expiryDate: new Date('2030-04-01T00:00:00.000Z'),
        quantity: 5,
        purchasePrice: '10.00',
        sellingPrice: '12.00',
        idempotencyKey: `receive-stale-${randomUUID()}`,
      });
      // Evaluating with `now` advanced beyond the V1 fresh window turns the
      // freshly-received evidence deterministically stale.
      const laterNow = new Date(Date.now() + 48 * 3_600_000);
      const evaluation = await trustService.evaluateProviderProduct(
        tenantId,
        providerId,
        isolatedProductId,
        { now: laterNow, policy: DEFAULT_AVAILABILITY_FRESHNESS_POLICY },
      );
      expect(evaluation.state).toBe('CONFIRMATION_REQUIRED');
      expect(evaluation.reasonCode).toBe('ELIGIBLE_QUANTITY_STALE');
      expect(evaluation.availableQuantity).toBe(5);
    });

    it('quarantined-only stock evaluates UNAVAILABLE even with fresh evidence', async () => {
      const isolatedProductId = await createIsolatedProduct();
      await commandService.configureInventory({
        actor,
        providerId,
        productId: isolatedProductId,
        sellingPrice: '50.00',
        mrp: '60.00',
        discountPercentage: '0.00',
        taxPercentage: '5.00',
        minimumStockLevel: 1,
        isVisible: true,
        idempotencyKey: `configure-q-${randomUUID()}`,
      });
      const received = await commandService.receiveBatch({
        actor,
        providerId,
        productId: isolatedProductId,
        batchNumber: `Q-${randomUUID()}`,
        expiryDate: new Date('2030-08-01T00:00:00.000Z'),
        quantity: 4,
        purchasePrice: '10.00',
        sellingPrice: '12.00',
        idempotencyKey: `receive-q-${randomUUID()}`,
      });
      await prisma.client.batch.update({
        where: { id: received.batchId },
        data: { status: 'QUARANTINED' },
      });
      const evaluation = await trustService.evaluateProviderProduct(
        tenantId,
        providerId,
        isolatedProductId,
        { policy: DEFAULT_AVAILABILITY_FRESHNESS_POLICY },
      );
      expect(evaluation.state).toBe('UNAVAILABLE');
      expect(evaluation.availableQuantity).toBe(0);
    });
  });
  describe('monotonic / out-of-order evidence', () => {
    it('an older delayed observation cannot replace newer evidence', async () => {
      const received = await commandService.receiveBatch({
        actor,
        providerId,
        productId,
        batchNumber: `MONO-${randomUUID()}`,
        expiryDate: new Date('2030-05-01T00:00:00.000Z'),
        quantity: 8,
        purchasePrice: '10.00',
        sellingPrice: '12.00',
        idempotencyKey: `receive-mono-${randomUUID()}`,
      });
      const countBefore = await prisma.client.batchStockObservation.count({
        where: { tenantId, batchId: received.batchId },
      });
      const olderAttempt = await evidenceService.recordObservation(
        prisma.client,
        {
          tenantId,
          inventoryId,
          batchId: received.batchId,
          providerId,
          productId,
          source: 'AIM_MANAGED_INVENTORY',
          observedOnHandQuantity: 8,
          occurredAt: new Date(Date.now() - 24 * 3_600_000),
          idempotencyKey: `mono-delayed-${randomUUID()}`,
        },
        { policy: DEFAULT_AVAILABILITY_FRESHNESS_POLICY },
      );
      expect(olderAttempt).toBe(false);
      await expect(
        prisma.client.batchStockObservation.count({
          where: { tenantId, batchId: received.batchId },
        }),
      ).resolves.toBe(countBefore);
    });

    it('fails closed on conflicting equal-timestamp evidence', async () => {
      const received = await commandService.receiveBatch({
        actor,
        providerId,
        productId,
        batchNumber: `EQUAL-${randomUUID()}`,
        expiryDate: new Date('2030-05-15T00:00:00.000Z'),
        quantity: 6,
        purchasePrice: '10.00',
        sellingPrice: '12.00',
        idempotencyKey: `receive-equal-${randomUUID()}`,
      });
      const existing = await prisma.client.batchStockObservation.findFirstOrThrow({
        where: { tenantId, batchId: received.batchId },
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      });

      await expect(
        evidenceService.recordObservation(
          prisma.client,
          {
            tenantId,
            inventoryId,
            batchId: received.batchId,
            providerId,
            productId,
            source: 'AIM_MANAGED_INVENTORY',
            observedOnHandQuantity: 5,
            occurredAt: existing.occurredAt,
            movementId: existing.movementId ?? undefined,
            idempotencyKey: `equal-conflict-${randomUUID()}`,
          },
          { policy: DEFAULT_AVAILABILITY_FRESHNESS_POLICY },
        ),
      ).rejects.toThrow('same batch timestamp');
    });
  });

  describe('tenant/provider isolation', () => {
    it('cannot attach evidence to a batch outside the owning tenant (FK fail closed)', async () => {
      const otherTenantId = randomUUID();
      await prisma.client.tenant.create({
        data: { id: otherTenantId, name: 'Other tenant', slug: `t0025b-${otherTenantId}` },
      });
      const received = await commandService.receiveBatch({
        actor,
        providerId,
        productId,
        batchNumber: `ISO-${randomUUID()}`,
        expiryDate: new Date('2030-06-01T00:00:00.000Z'),
        quantity: 4,
        purchasePrice: '10.00',
        sellingPrice: '12.00',
        idempotencyKey: `receive-iso-${randomUUID()}`,
      });
      await expect(
        prisma.client.batchStockObservation.create({
          data: {
            tenantId: otherTenantId,
            inventoryId,
            batchId: received.batchId,
            providerId,
            productId,
            source: 'AIM_MANAGED_INVENTORY',
            observedOnHandQuantity: 4,
            occurredAt: new Date(),
            idempotencyKey: `cross-tenant-${randomUUID()}`,
          },
        }),
      ).rejects.toMatchObject({ code: 'P2003' });
      await prisma.client.tenant.delete({ where: { id: otherTenantId } });
    });

    it('Provider A evidence cannot affect Provider B trust', async () => {
      const providerBId = randomUUID();
      await prisma.client.provider.create({
        data: {
          id: providerBId,
          tenantId,
          providerType: 'PHARMACY',
          businessName: 'Provider B',
          ownerName: 'Fixture Owner',
          email: `${providerBId}@medsphere.test`,
          phone: '0000000000',
          address: 'Fixture address',
          city: 'Chennai',
          state: 'Tamil Nadu',
          country: 'India',
          postalCode: '600001',
          latitude: 13.0,
          longitude: 80.2,
          isVerified: true,
        },
      });
      await expect(
        prisma.client.batchStockObservation.findMany({
          where: { tenantId, providerId: providerBId },
        }),
      ).resolves.toHaveLength(0);
      const evaluationForB = await trustService.evaluateProviderProduct(
        tenantId,
        providerBId,
        productId,
        { policy: DEFAULT_AVAILABILITY_FRESHNESS_POLICY },
      );
      // Provider B has no inventory listing: UNKNOWN, with zero quantity
      // influence from Provider A's evidence.
      expect(evaluationForB.state).toBe('UNKNOWN');
      expect(evaluationForB.availableQuantity).toBe(0);
      await prisma.client.provider.delete({ where: { id: providerBId } });
    });
  });

  describe('evidence source fail-closed', () => {
    it('rejects an invalid evidence source at the service boundary', async () => {
      const received = await commandService.receiveBatch({
        actor,
        providerId,
        productId,
        batchNumber: `SRC-${randomUUID()}`,
        expiryDate: new Date('2030-07-01T00:00:00.000Z'),
        quantity: 3,
        purchasePrice: '10.00',
        sellingPrice: '12.00',
        idempotencyKey: `receive-src-${randomUUID()}`,
      });
      await expect(
        evidenceService.recordObservation(
          prisma.client,
          {
            tenantId,
            inventoryId,
            batchId: received.batchId,
            providerId,
            productId,
            source: 'CLIENT_SUPPLIED_FAKE' as never,
            observedOnHandQuantity: 3,
            occurredAt: new Date(),
            idempotencyKey: `src-${randomUUID()}`,
          },
          { policy: DEFAULT_AVAILABILITY_FRESHNESS_POLICY },
        ),
      ).rejects.toThrow('Availability evidence source is not accepted');
    });
  });

  async function createIsolatedProduct(): Promise<string> {
    const id = randomUUID();
    await prisma.client.product.create({
      data: {
        id,
        name: 'Task 0025 Isolated Medicine',
        brand: 'Fixture Brand',
        category: 'MEDICINE',
        manufacturer: 'Fixture Manufacturer',
        dosageForm: 'TABLET',
        strength: '5 mg',
      },
    });
    return id;
  }
});
