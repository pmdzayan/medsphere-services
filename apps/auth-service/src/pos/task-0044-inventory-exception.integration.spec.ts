import { randomUUID } from 'node:crypto';

import { AuditWriter } from '../audit/audit-writer.service';
import { isInfrastructureTestEnabled, requireEnv } from '../auth/testing/infrastructure-test-gate';
import { InventoryEventWriter } from '../inventory/inventory-event-writer';
import { InventoryExceptionService } from '../inventory/inventory-exception.service';
import { PharmacyVerificationEligibilityEvaluator } from '../pharmacy-verification/pharmacy-verification-eligibility.evaluator';
import { PrismaService } from '../prisma/prisma.service';
import { PosCheckoutService } from './pos-checkout.service';
import { PosEventWriter } from './pos-event-writer';
import { PosReturnService } from './pos-return.service';

const infra = isInfrastructureTestEnabled() ? describe : describe.skip;
if (isInfrastructureTestEnabled()) requireEnv('DATABASE_URL');

infra('Task 0044 PostgreSQL return, recall and disposition integrity', () => {
  const prisma = new PrismaService();
  const audit = new AuditWriter();
  const inventoryEvents = new InventoryEventWriter();
  const posEvents = new PosEventWriter();
  const checkout = new PosCheckoutService(
    prisma,
    audit,
    posEvents,
    inventoryEvents,
    new PharmacyVerificationEligibilityEvaluator(prisma),
  );
  const returns = new PosReturnService(prisma, audit, posEvents);
  const exceptions = new InventoryExceptionService(prisma, audit, inventoryEvents);

  const tenantId = randomUUID();
  const providerId = randomUUID();
  const userId = randomUUID();
  const membershipId = randomUUID();
  const approverUserId = randomUUID();
  const approverMembershipId = randomUUID();
  const actor = { tenantId, userId, membershipId };
  const approver = {
    tenantId,
    userId: approverUserId,
    membershipId: approverMembershipId,
  };

  beforeAll(async () => {
    await prisma.client.tenant.create({
      data: {
        id: tenantId,
        name: 'Task 0044 tenant',
        slug: `task0044-${tenantId}`,
        organizationType: 'PHARMACY',
      },
    });
    await prisma.client.user.createMany({
      data: [
        {
          id: userId,
          email: `${userId}@task0044.invalid`,
          passwordHash: 'integration-only-placeholder',
          firstName: 'Return',
          lastName: 'Operator',
        },
        {
          id: approverUserId,
          email: `${approverUserId}@task0044.invalid`,
          passwordHash: 'integration-only-placeholder',
          firstName: 'Second',
          lastName: 'Approver',
        },
      ],
    });
    await prisma.client.tenantMembership.createMany({
      data: [
        { id: membershipId, tenantId, userId, status: 'ACTIVE', joinedAt: new Date() },
        {
          id: approverMembershipId,
          tenantId,
          userId: approverUserId,
          status: 'ACTIVE',
          joinedAt: new Date(),
        },
      ],
    });
    await prisma.client.provider.create({
      data: {
        id: providerId,
        tenantId,
        providerType: 'PHARMACY',
        businessName: 'Task 0044 Pharmacy',
        ownerName: 'Fixture Owner',
        email: `${providerId}@task0044.invalid`,
        phone: '0000000044',
        address: '44 Test Street, Chennai, Tamil Nadu 600001',
        city: 'Chennai',
        state: 'Tamil Nadu',
        country: 'India',
        postalCode: '600001',
        latitude: 13.0827,
        longitude: 80.2707,
        isVerified: true,
        isActive: true,
      },
    });
    await prisma.client.membershipProviderAccess.createMany({
      data: [
        { id: randomUUID(), tenantId, membershipId, providerId },
        { id: randomUUID(), tenantId, membershipId: approverMembershipId, providerId },
      ],
    });
    await prisma.client.providerVerification.create({
      data: {
        id: randomUUID(),
        tenantId,
        providerId,
        providerType: 'PHARMACY',
        status: 'APPROVED',
        licenseNumber: `DL-${randomUUID()}`,
        licenseExpiryDate: new Date('2035-12-31T00:00:00.000Z'),
        businessRegistrationNumber: `BR-${randomUUID()}`,
        governmentIdReference: `GOV-${randomUUID()}`,
        verifiedAt: new Date(),
        isCurrent: true,
      },
    });
    await prisma.client.pharmacyFiscalProfile.create({
      data: {
        tenantId,
        providerId,
        registrationType: 'GST_REGULAR',
        legalName: 'Task 0044 Pharmacy Private Limited',
        gstin: '33ABCDE1234F1Z5',
        stateCode: '33',
        invoiceSeries: 'A44',
        pricesIncludeTax: true,
      },
    });
  });

  afterAll(async () => prisma.client.$disconnect());

  it('bounds partial returns to original sale allocations and quarantines returned stock', async () => {
    const fixture = await stockFixture('Return', 10, 0, 'ACTIVE');
    const sale = await checkout.checkout({
      actor,
      providerId,
      idempotencyKey: `checkout-${randomUUID()}`,
      lines: [{ productId: fixture.productId, quantity: 4 }],
      payments: [{ method: 'CASH', amount: '400.00' }],
      placeOfSupplyStateCode: '33',
    });
    const saleLineId = sale.lines[0]!.saleLineId;
    const key = `return-${randomUUID()}`;
    const command = {
      actor,
      providerId,
      saleId: sale.saleId,
      idempotencyKey: key,
      reasonCode: 'CUSTOMER_REQUEST' as const,
      reason: 'Customer returned sealed units with original invoice.',
      refundMethod: 'CASH' as const,
      lines: [{ saleLineId, quantity: 2 }],
    };

    const first = await returns.returnSale(command);
    const replay = await returns.returnSale(command);
    expect(first).toMatchObject({
      saleId: sale.saleId,
      lineCount: 1,
      totalQuantity: 2,
      refundTotal: '200.00',
      replayed: false,
    });
    expect(replay).toMatchObject({ returnId: first.returnId, replayed: true });

    const afterFirst = await prisma.client.batch.findUniqueOrThrow({
      where: { id: fixture.batchId },
      select: { onHandQuantity: true, status: true },
    });
    expect(afterFirst).toEqual({ onHandQuantity: 8, status: 'QUARANTINED' });

    const concurrent = await Promise.allSettled([
      returns.returnSale({
        ...command,
        idempotencyKey: `return-${randomUUID()}`,
        lines: [{ saleLineId, quantity: 2 }],
      }),
      returns.returnSale({
        ...command,
        idempotencyKey: `return-${randomUUID()}`,
        lines: [{ saleLineId, quantity: 2 }],
      }),
    ]);
    expect(concurrent.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(concurrent.filter((result) => result.status === 'rejected')).toHaveLength(1);

    const [batch, returned, movements, auditEvents] = await Promise.all([
      prisma.client.batch.findUniqueOrThrow({
        where: { id: fixture.batchId },
        select: { onHandQuantity: true, status: true },
      }),
      prisma.client.pharmacySaleReturnLine.aggregate({
        where: { saleId: sale.saleId, saleLineId },
        _sum: { quantity: true },
      }),
      prisma.client.stockMovement.findMany({
        where: { tenantId, providerId, referenceType: 'pharmacy.sale.return' },
        select: { type: true, delta: true, actorMembershipId: true },
      }),
      prisma.client.auditEvent.findMany({
        where: {
          tenantId,
          resourceType: 'PharmacySaleReturn',
          eventType: 'billing.pos.return.completed',
        },
        select: { actorMembershipId: true, actorUserId: true },
      }),
    ]);
    expect(batch).toEqual({ onHandQuantity: 10, status: 'QUARANTINED' });
    expect(returned._sum.quantity).toBe(4);
    expect(movements.reduce((sum, movement) => sum + movement.delta, 0)).toBe(4);
    expect(movements.every((movement) => movement.type === 'RETURN_IN')).toBe(true);
    expect(movements.every((movement) => movement.actorMembershipId === membershipId)).toBe(true);
    expect(auditEvents.every((event) => event.actorUserId === userId)).toBe(true);
  });

  it('recalls without removing physical stock and atomically cancels affected held reservations', async () => {
    const fixture = await stockFixture('Recall', 5, 2, 'ACTIVE');
    const reservationId = randomUUID();
    const itemId = randomUUID();
    const allocationId = randomUUID();
    await prisma.client.medicineReservation.create({
      data: {
        id: reservationId,
        tenantId,
        providerId,
        subjectUserId: userId,
        status: 'READY',
        expiresAt: new Date('2030-01-01T00:00:00.000Z'),
        confirmedAt: new Date(),
        readyAt: new Date(),
        idempotencyKey: `reservation-${randomUUID()}`,
        creationHash: 'a'.repeat(64),
        version: 2,
      },
    });
    await prisma.client.medicineReservationItem.create({
      data: {
        id: itemId,
        tenantId,
        reservationId,
        providerId,
        productId: fixture.productId,
        quantity: 2,
      },
    });
    await prisma.client.medicineReservationAllocation.create({
      data: {
        id: allocationId,
        tenantId,
        reservationId,
        itemId,
        inventoryId: fixture.inventoryId,
        batchId: fixture.batchId,
        providerId,
        productId: fixture.productId,
        quantity: 2,
        status: 'HELD',
      },
    });

    const key = `recall-${randomUUID()}`;
    const command = {
      actor,
      providerId,
      batchId: fixture.batchId,
      expectedVersion: 1,
      idempotencyKey: key,
      reasonCode: 'MANUFACTURER_RECALL' as const,
      reason: 'Manufacturer issued a batch-specific safety recall.',
    };
    const result = await exceptions.recall(command);
    const replay = await exceptions.recall(command);

    const [batch, reservation, allocation, recallRecord] = await Promise.all([
      prisma.client.batch.findUniqueOrThrow({
        where: { id: fixture.batchId },
        select: { status: true, onHandQuantity: true, heldQuantity: true, version: true },
      }),
      prisma.client.medicineReservation.findUniqueOrThrow({
        where: { id: reservationId },
        select: { status: true },
      }),
      prisma.client.medicineReservationAllocation.findUniqueOrThrow({
        where: { id: allocationId },
        select: { status: true },
      }),
      prisma.client.batchRecallRecord.findUniqueOrThrow({
        where: { batchId: fixture.batchId },
        select: { actorMembershipId: true, actorUserId: true },
      }),
    ]);
    expect(result).toMatchObject({
      status: 'RECALLED',
      onHandQuantity: 5,
      affectedReservationCount: 1,
      releasedUnitCount: 2,
      replayed: false,
    });
    expect(replay.replayed).toBe(true);
    expect(batch).toEqual({ status: 'RECALLED', onHandQuantity: 5, heldQuantity: 0, version: 3 });
    expect(reservation.status).toBe('CANCELLED');
    expect(allocation.status).toBe('RELEASED');
    expect(recallRecord).toEqual({ actorMembershipId: membershipId, actorUserId: userId });
  });

  it('requires a second actor and conserves stock for disposal decisions', async () => {
    const fixture = await stockFixture('Disposal', 5, 0, 'QUARANTINED');
    const request = await exceptions.request({
      actor,
      providerId,
      batchId: fixture.batchId,
      expectedVersion: 1,
      action: 'DISPOSAL',
      quantity: 3,
      idempotencyKey: `exception-${randomUUID()}`,
      reason: 'Quarantined units require documented destruction.',
    });

    await expect(
      exceptions.decide({
        actor,
        providerId,
        requestId: request.requestId,
        outcome: 'APPROVED',
        idempotencyKey: `decision-${randomUUID()}`,
        reason: 'Self-approval must fail.',
      }),
    ).rejects.toThrow('requires a different actor');

    const decisions = await Promise.allSettled([
      exceptions.decide({
        actor: approver,
        providerId,
        requestId: request.requestId,
        outcome: 'APPROVED',
        idempotencyKey: `decision-${randomUUID()}`,
        reason: 'Physical destruction verified by second operator.',
      }),
      exceptions.decide({
        actor: approver,
        providerId,
        requestId: request.requestId,
        outcome: 'APPROVED',
        idempotencyKey: `decision-${randomUUID()}`,
        reason: 'Concurrent duplicate decision must not double-remove stock.',
      }),
    ]);
    expect(decisions.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(decisions.filter((result) => result.status === 'rejected')).toHaveLength(1);

    const [batch, movement, decision] = await Promise.all([
      prisma.client.batch.findUniqueOrThrow({
        where: { id: fixture.batchId },
        select: { status: true, onHandQuantity: true, version: true },
      }),
      prisma.client.stockMovement.findFirstOrThrow({
        where: {
          tenantId,
          providerId,
          batchId: fixture.batchId,
          referenceType: 'inventory.exception.disposal',
        },
        select: { type: true, delta: true, onHandBefore: true, onHandAfter: true, actorMembershipId: true },
      }),
      prisma.client.inventoryExceptionDecision.findUniqueOrThrow({
        where: { requestId: request.requestId },
        select: { decidedByMembershipId: true, decidedByUserId: true },
      }),
    ]);
    expect(batch).toEqual({ status: 'QUARANTINED', onHandQuantity: 2, version: 2 });
    expect(movement).toEqual({
      type: 'DISPOSAL',
      delta: -3,
      onHandBefore: 5,
      onHandAfter: 2,
      actorMembershipId: approverMembershipId,
    });
    expect(decision).toEqual({
      decidedByMembershipId: approverMembershipId,
      decidedByUserId: approverUserId,
    });
  });

  it('releases quarantined stock without fabricating a movement and rejects stale approval state', async () => {
    const fixture = await stockFixture('Release', 3, 0, 'QUARANTINED');
    const request = await exceptions.request({
      actor,
      providerId,
      batchId: fixture.batchId,
      expectedVersion: 1,
      action: 'QUARANTINE_RELEASE',
      idempotencyKey: `exception-${randomUUID()}`,
      reason: 'Quality investigation cleared this sealed batch.',
    });
    const decision = await exceptions.decide({
      actor: approver,
      providerId,
      requestId: request.requestId,
      outcome: 'APPROVED',
      idempotencyKey: `decision-${randomUUID()}`,
      reason: 'Independent review confirms release criteria.',
    });
    expect(decision).toMatchObject({
      action: 'QUARANTINE_RELEASE',
      movementId: null,
      onHandBefore: 3,
      onHandAfter: 3,
      resultingBatchVersion: 2,
    });

    const [batch, movements] = await Promise.all([
      prisma.client.batch.findUniqueOrThrow({
        where: { id: fixture.batchId },
        select: { status: true, onHandQuantity: true },
      }),
      prisma.client.stockMovement.count({
        where: { tenantId, providerId, batchId: fixture.batchId },
      }),
    ]);
    expect(batch).toEqual({ status: 'ACTIVE', onHandQuantity: 3 });
    expect(movements).toBe(0);

    const stale = await stockFixture('Stale release', 3, 0, 'QUARANTINED');
    const staleRequest = await exceptions.request({
      actor,
      providerId,
      batchId: stale.batchId,
      expectedVersion: 1,
      action: 'QUARANTINE_RELEASE',
      idempotencyKey: `exception-${randomUUID()}`,
      reason: 'Pending release after investigation.',
    });
    await prisma.client.batch.update({
      where: { id: stale.batchId },
      data: { version: { increment: 1 } },
    });
    await expect(
      exceptions.decide({
        actor: approver,
        providerId,
        requestId: staleRequest.requestId,
        outcome: 'APPROVED',
        idempotencyKey: `decision-${randomUUID()}`,
        reason: 'Stale state must fail closed.',
      }),
    ).rejects.toThrow('stale');
  });

  async function stockFixture(
    label: string,
    onHand: number,
    held: number,
    status: 'ACTIVE' | 'QUARANTINED',
  ): Promise<{ productId: string; inventoryId: string; batchId: string }> {
    const productId = randomUUID();
    const inventoryId = randomUUID();
    const batchId = randomUUID();
    await prisma.client.product.create({
      data: {
        id: productId,
        name: `Task 0044 ${label} Medicine`,
        genericName: `Generic ${label}`,
        brand: `Brand ${label}`,
        category: 'MEDICINE',
        manufacturer: 'Fixture Manufacturer',
        dosageForm: 'TABLET',
        strength: '10 mg',
        requiresPrescription: false,
      },
    });
    await prisma.client.inventory.create({
      data: {
        id: inventoryId,
        tenantId,
        providerId,
        productId,
        sellingPrice: '100.00',
        mrp: '110.00',
        discountPercentage: '0.00',
        taxPercentage: '5.00',
        minimumStockLevel: 1,
        isVisible: true,
      },
    });
    await prisma.client.inventoryFiscalProfile.create({
      data: {
        tenantId,
        providerId,
        inventoryId,
        productId,
        hsnCode: '3004',
        uqc: 'NOS',
        cessPercentage: '0.00',
      },
    });
    await prisma.client.batch.create({
      data: {
        id: batchId,
        tenantId,
        inventoryId,
        providerId,
        productId,
        batchNumber: `T44-${label.replaceAll(' ', '-')}-${randomUUID()}`,
        manufacturingDate: new Date('2026-01-01T00:00:00.000Z'),
        expiryDate: new Date('2032-01-01T00:00:00.000Z'),
        receivedQuantity: onHand + Math.max(0, held),
        onHandQuantity: onHand,
        heldQuantity: held,
        purchasePrice: '80.00',
        sellingPrice: '100.00',
        status,
      },
    });
    return { productId, inventoryId, batchId };
  }
});
