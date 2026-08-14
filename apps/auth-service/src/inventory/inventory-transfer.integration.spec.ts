import { randomUUID } from 'node:crypto';
import { AuditWriter } from '../audit/audit-writer.service';
import type { AuthenticatedIdentity } from '../auth/auth.types';
import { isInfrastructureTestEnabled, requireEnv } from '../auth/testing/infrastructure-test-gate';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryTransferService } from './inventory-transfer.service';
import { InventoryEventWriter } from './inventory-event-writer';
const infra = isInfrastructureTestEnabled() ? describe : describe.skip;
if (isInfrastructureTestEnabled()) requireEnv('DATABASE_URL');

infra('G3.8 PostgreSQL completed transfer integrity', () => {
  const prisma = new PrismaService(),
    service = new InventoryTransferService(prisma, new AuditWriter(), new InventoryEventWriter());
  const tenantId = randomUUID(),
    userId = randomUUID(),
    membershipId = randomUUID(),
    sourceProviderId = randomUUID(),
    destinationProviderId = randomUUID();
  const actor: AuthenticatedIdentity = {
    tenantId,
    userId,
    membershipId,
    sessionId: randomUUID(),
    tokenId: randomUUID(),
  };
  beforeAll(async () => {
    await prisma.client.tenant.create({
      data: { id: tenantId, name: 'G3.8 tenant', slug: `g38-${tenantId}` },
    });
    await prisma.client.user.create({
      data: {
        id: userId,
        email: `${userId}@test.invalid`,
        passwordHash: 'integration-placeholder',
        firstName: 'Transfer',
        lastName: 'Test',
      },
    });
    await prisma.client.tenantMembership.create({
      data: { id: membershipId, tenantId, userId, status: 'ACTIVE', joinedAt: new Date() },
    });
    const provider = (id: string, name: string) => ({
      id,
      tenantId,
      providerType: 'PHARMACY' as const,
      businessName: name,
      ownerName: 'Owner',
      email: `${id}@test.invalid`,
      phone: '0000000000',
      address: 'Address',
      city: 'Chennai',
      state: 'Tamil Nadu',
      country: 'India',
      postalCode: '600001',
      latitude: 13,
      longitude: 80,
      isVerified: true,
    });
    await prisma.client.provider.createMany({
      data: [provider(sourceProviderId, 'Source'), provider(destinationProviderId, 'Destination')],
    });
    await prisma.client.membershipProviderAccess.createMany({
      data: [sourceProviderId, destinationProviderId].map((providerId) => ({
        id: randomUUID(),
        tenantId,
        membershipId,
        providerId,
      })),
    });
  });
  afterAll(async () => prisma.client.$disconnect());

  it('conserves stock, writes paired movements/audit, and replays once', async () => {
    const f = await stock(20, 4),
      key = `success-${randomUUID()}`;
    const cmd = {
      actor,
      sourceProviderId,
      destinationProviderId,
      sourceBatchId: f.sourceBatchId,
      expectedSourceVersion: 1,
      quantity: 6,
      idempotencyKey: key,
    };
    const first = await service.recordCompleted(cmd),
      replay = await service.recordCompleted(cmd);
    expect(first).toMatchObject({
      sourceOnHandAfter: 14,
      destinationOnHandAfter: 6,
      replayed: false,
    });
    expect(replay).toMatchObject({ transferId: first.transferId, replayed: true });
    const [source, destination, movements, receipts, audits] = await Promise.all([
      prisma.client.batch.findUniqueOrThrow({ where: { id: f.sourceBatchId } }),
      prisma.client.batch.findUniqueOrThrow({ where: { id: first.destinationBatchId } }),
      prisma.client.stockMovement.findMany({
        where: { referenceId: first.transferId },
        orderBy: { delta: 'asc' },
      }),
      prisma.client.inventoryTransfer.count({ where: { id: first.transferId } }),
      prisma.client.auditEvent.findMany({
        where: { resourceId: first.transferId, eventType: 'inventory.stock.transferred' },
      }),
    ]);
    expect(source).toMatchObject({ onHandQuantity: 14, heldQuantity: 4, receivedQuantity: 20 });
    expect(destination).toMatchObject({ onHandQuantity: 6, heldQuantity: 0, receivedQuantity: 6 });
    expect(movements.map(({ type, delta }) => ({ type, delta }))).toEqual([
      { type: 'TRANSFER_OUT', delta: -6 },
      { type: 'TRANSFER_IN', delta: 6 },
    ]);
    expect(receipts).toBe(1);
    expect(audits).toHaveLength(1);
  });

  it('rolls back held-stock and provenance failures and merges exact provenance preserving held', async () => {
    const held = await stock(10, 8);
    await expect(
      service.recordCompleted({
        actor,
        sourceProviderId,
        destinationProviderId,
        sourceBatchId: held.sourceBatchId,
        expectedSourceVersion: 1,
        quantity: 3,
        idempotencyKey: `held-${randomUUID()}`,
      }),
    ).rejects.toThrow('Insufficient available');
    const bad = await stock(12, 0, { price: '99.00' });
    await expect(
      service.recordCompleted({
        actor,
        sourceProviderId,
        destinationProviderId,
        sourceBatchId: bad.sourceBatchId,
        expectedSourceVersion: 1,
        quantity: 2,
        idempotencyKey: `bad-${randomUUID()}`,
      }),
    ).rejects.toThrow('provenance conflict');
    await expect(
      prisma.client.batch.findUniqueOrThrow({ where: { id: bad.sourceBatchId } }),
    ).resolves.toMatchObject({ onHandQuantity: 12, version: 1 });
    const merge = await stock(12, 0, { onHand: 5, held: 2 });
    const result = await service.recordCompleted({
      actor,
      sourceProviderId,
      destinationProviderId,
      sourceBatchId: merge.sourceBatchId,
      expectedSourceVersion: 1,
      quantity: 4,
      idempotencyKey: `merge-${randomUUID()}`,
    });
    expect(result).toMatchObject({
      destinationBatchId: merge.destinationBatchId,
      destinationOnHandAfter: 9,
      destinationBatchVersion: 2,
    });
    await expect(
      prisma.client.batch.findUniqueOrThrow({ where: { id: merge.destinationBatchId! } }),
    ).resolves.toMatchObject({ receivedQuantity: 9, onHandQuantity: 9, heldQuantity: 2 });
  });

  it('allows one expected-version race winner and conceals receipt after access revocation', async () => {
    const f = await stock(15, 0),
      keys = [`a-${randomUUID()}`, `b-${randomUUID()}`];
    const results = await Promise.allSettled(
      keys.map((idempotencyKey) =>
        service.recordCompleted({
          actor,
          sourceProviderId,
          destinationProviderId,
          sourceBatchId: f.sourceBatchId,
          expectedSourceVersion: 1,
          quantity: 3,
          idempotencyKey,
        }),
      ),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    const winner = results.find(
      (r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof service.recordCompleted>>> =>
        r.status === 'fulfilled',
    )!;
    const receipt = await prisma.client.inventoryTransfer.findUniqueOrThrow({
      where: { id: winner.value.transferId },
    });
    await prisma.client.membershipProviderAccess.deleteMany({
      where: { tenantId, membershipId, providerId: destinationProviderId },
    });
    await expect(
      service.recordCompleted({
        actor,
        sourceProviderId,
        destinationProviderId,
        sourceBatchId: f.sourceBatchId,
        expectedSourceVersion: 1,
        quantity: 3,
        idempotencyKey: receipt.idempotencyKey,
      }),
    ).rejects.toThrow('Provider inventory not found');
    await prisma.client.membershipProviderAccess.create({
      data: { id: randomUUID(), tenantId, membershipId, providerId: destinationProviderId },
    });
  });

  it('enforces append-only receipt and migration-owned permission', async () => {
    const f = await stock(8, 0),
      result = await service.recordCompleted({
        actor,
        sourceProviderId,
        destinationProviderId,
        sourceBatchId: f.sourceBatchId,
        expectedSourceVersion: 1,
        quantity: 1,
        idempotencyKey: `append-${randomUUID()}`,
      });
    await expect(
      prisma.client.inventoryTransfer.delete({ where: { id: result.transferId } }),
    ).rejects.toThrow('InventoryTransfer is append-only');
    await expect(
      prisma.client.permission.findUniqueOrThrow({ where: { name: 'inventory.stock.transfer' } }),
    ).resolves.toMatchObject({ name: 'inventory.stock.transfer' });
  });

  async function stock(
    onHand: number,
    held: number,
    destination?: { price?: string; onHand?: number; held?: number },
  ) {
    const productId = randomUUID(),
      sourceInventoryId = randomUUID(),
      destinationInventoryId = randomUUID(),
      sourceBatchId = randomUUID(),
      batchNumber = `G38-${randomUUID()}`;
    await prisma.client.product.create({
      data: {
        id: productId,
        name: 'Medicine',
        brand: 'Brand',
        category: 'MEDICINE',
        manufacturer: 'Maker',
        dosageForm: 'TABLET',
        strength: '10mg',
      },
    });
    await prisma.client.inventory.createMany({
      data: [sourceProviderId, destinationProviderId].map((providerId, i) => ({
        id: i ? destinationInventoryId : sourceInventoryId,
        tenantId,
        providerId,
        productId,
        sellingPrice: '12.00',
        mrp: '15.00',
        discountPercentage: '0.00',
        taxPercentage: '5.00',
      })),
    });
    const base = {
      tenantId,
      productId,
      batchNumber,
      manufacturingDate: new Date('2026-01-01'),
      expiryDate: new Date('2030-01-01'),
      sellingPrice: '12.00',
    };
    await prisma.client.batch.create({
      data: {
        ...base,
        id: sourceBatchId,
        inventoryId: sourceInventoryId,
        providerId: sourceProviderId,
        receivedQuantity: onHand,
        onHandQuantity: onHand,
        heldQuantity: held,
        purchasePrice: '10.00',
      },
    });
    let destinationBatchId: string | undefined;
    if (destination) {
      destinationBatchId = randomUUID();
      const q = destination.onHand ?? 1;
      await prisma.client.batch.create({
        data: {
          ...base,
          id: destinationBatchId,
          inventoryId: destinationInventoryId,
          providerId: destinationProviderId,
          receivedQuantity: q,
          onHandQuantity: q,
          heldQuantity: destination.held ?? 0,
          purchasePrice: destination.price ?? '10.00',
        },
      });
    }
    return { sourceBatchId, destinationBatchId };
  }
});
