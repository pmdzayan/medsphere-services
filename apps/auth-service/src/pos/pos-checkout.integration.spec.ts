import { randomUUID } from 'node:crypto';

import { AuditWriter } from '../audit/audit-writer.service';
import { isInfrastructureTestEnabled, requireEnv } from '../auth/testing/infrastructure-test-gate';
import { InventoryEventWriter } from '../inventory/inventory-event-writer';
import { PharmacyVerificationEligibilityEvaluator } from '../pharmacy-verification/pharmacy-verification-eligibility.evaluator';
import { PrismaService } from '../prisma/prisma.service';
import { PosCheckoutService } from './pos-checkout.service';
import { PosEventWriter } from './pos-event-writer';

const infra = isInfrastructureTestEnabled() ? describe : describe.skip;
if (isInfrastructureTestEnabled()) requireEnv('DATABASE_URL');

infra('Task 0043 PostgreSQL POS transaction integrity and concurrency', () => {
  const prisma = new PrismaService();
  const audit = new AuditWriter();
  const service = new PosCheckoutService(
    prisma,
    audit,
    new PosEventWriter(),
    new InventoryEventWriter(),
    new PharmacyVerificationEligibilityEvaluator(prisma),
  );

  const tenantId = randomUUID();
  const userId = randomUUID();
  const membershipId = randomUUID();
  const providerId = randomUUID();
  const actor = { tenantId, userId, membershipId };

  beforeAll(async () => {
    await prisma.client.tenant.create({
      data: {
        id: tenantId,
        name: 'Task 0043 POS tenant',
        slug: `task0043-${tenantId}`,
        organizationType: 'PHARMACY',
      },
    });
    await prisma.client.user.create({
      data: {
        id: userId,
        email: `${userId}@task0043.invalid`,
        passwordHash: 'integration-only-placeholder',
        firstName: 'POS',
        lastName: 'Operator',
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
        businessName: 'Task 0043 Pharmacy',
        ownerName: 'Fixture Owner',
        email: `${providerId}@task0043.invalid`,
        phone: '0000000043',
        address: '43 Test Street, Chennai, Tamil Nadu 600001',
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
    await prisma.client.membershipProviderAccess.create({
      data: { id: randomUUID(), tenantId, membershipId, providerId },
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
        legalName: 'Task 0043 Pharmacy Private Limited',
        gstin: '33ABCDE1234F1Z5',
        stateCode: '33',
        invoiceSeries: 'A43',
        pricesIncludeTax: true,
      },
    });
  });

  afterAll(async () => prisma.client.$disconnect());

  it('consumes multiple batches in FEFO order, protects held stock, records payments and an immutable invoice', async () => {
    const fixture = await stockFixture({
      label: 'FEFO',
      batches: [
        { onHand: 5, held: 4, expiry: '2030-01-01T00:00:00.000Z' },
        { onHand: 5, held: 0, expiry: '2031-01-01T00:00:00.000Z' },
      ],
    });
    const key = `checkout-${randomUUID()}`;

    const receipt = await service.checkout({
      actor,
      providerId,
      idempotencyKey: key,
      lines: [{ productId: fixture.productId, quantity: 3 }],
      payments: [{ method: 'CASH', amount: '300.00' }],
      cashTendered: '320.00',
      placeOfSupplyStateCode: '33',
    });

    expect(receipt).toMatchObject({
      status: 'COMPLETED',
      grandTotal: '300.00',
      cashTendered: '320.00',
      changeDue: '20.00',
      replayed: false,
      invoice: {
        documentType: 'TAX_INVOICE',
        supplierStateCode: '33',
        placeOfSupplyStateCode: '33',
      },
    });
    expect(receipt.cgstTotal).not.toBe('0.00');
    expect(receipt.sgstTotal).toBe(receipt.cgstTotal);
    expect(receipt.igstTotal).toBe('0.00');

    const batches = await prisma.client.batch.findMany({
      where: { id: { in: fixture.batchIds } },
      orderBy: { expiryDate: 'asc' },
      select: { onHandQuantity: true, heldQuantity: true },
    });
    expect(batches).toEqual([
      { onHandQuantity: 4, heldQuantity: 4 },
      { onHandQuantity: 3, heldQuantity: 0 },
    ]);

    const movements = await prisma.client.stockMovement.findMany({
      where: { referenceType: 'pharmacy.sale.checkout', referenceId: receipt.saleId },
      orderBy: { createdAt: 'asc' },
    });
    expect(movements.map((movement) => movement.delta).sort((a, b) => a - b)).toEqual([-2, -1]);
    expect(movements.every((movement) => movement.actorMembershipId === membershipId)).toBe(true);

    const [paymentCount, allocationQuantity] = await Promise.all([
      prisma.client.pharmacySalePayment.count({ where: { saleId: receipt.saleId } }),
      prisma.client.pharmacySaleAllocation.aggregate({
        where: { saleId: receipt.saleId },
        _sum: { quantity: true },
      }),
    ]);
    expect(paymentCount).toBe(1);
    expect(allocationQuantity._sum.quantity).toBe(3);

    await expect(
      prisma.client.pharmacyInvoice.update({
        where: { id: receipt.invoice.id },
        data: { grandTotal: '999.00' },
      }),
    ).rejects.toThrow(/append-only/);
  });

  it('replays an identical checkout once and rejects conflicting idempotency-key reuse', async () => {
    const fixture = await stockFixture({
      label: 'Replay',
      batches: [{ onHand: 5, held: 0, expiry: '2030-01-01T00:00:00.000Z' }],
    });
    const key = `checkout-${randomUUID()}`;
    const command = {
      actor,
      providerId,
      idempotencyKey: key,
      lines: [{ productId: fixture.productId, quantity: 1 }],
      payments: [{ method: 'UPI' as const, amount: '100.00', externalReference: 'upi-proof' }],
      placeOfSupplyStateCode: '33',
    };

    const first = await service.checkout(command);
    const replay = await service.checkout(command);

    expect(replay.saleId).toBe(first.saleId);
    expect(replay.invoice.invoiceNumber).toBe(first.invoice.invoiceNumber);
    expect(replay.replayed).toBe(true);
    await expect(
      service.checkout({
        ...command,
        lines: [{ productId: fixture.productId, quantity: 2 }],
        payments: [{ method: 'UPI', amount: '200.00', externalReference: 'upi-proof' }],
      }),
    ).rejects.toThrow('Idempotency key is already used');

    await expect(
      prisma.client.stockMovement.count({
        where: { referenceType: 'pharmacy.sale.checkout', referenceId: first.saleId },
      }),
    ).resolves.toBe(1);
  });

  it('rejects expired/insufficient stock and payment mismatches without partial sale evidence', async () => {
    const fixture = await stockFixture({
      label: 'Rollback',
      batches: [
        { onHand: 100, held: 0, expiry: '2020-01-01T00:00:00.000Z' },
        { onHand: 1, held: 0, expiry: '2030-01-01T00:00:00.000Z' },
      ],
    });

    await expect(
      service.checkout({
        actor,
        providerId,
        idempotencyKey: `checkout-${randomUUID()}`,
        lines: [{ productId: fixture.productId, quantity: 2 }],
        payments: [{ method: 'CARD', amount: '200.00' }],
        placeOfSupplyStateCode: '33',
      }),
    ).rejects.toThrow('Insufficient eligible stock');

    await expect(
      service.checkout({
        actor,
        providerId,
        idempotencyKey: `checkout-${randomUUID()}`,
        lines: [{ productId: fixture.productId, quantity: 1 }],
        payments: [{ method: 'CARD', amount: '99.99' }],
        placeOfSupplyStateCode: '33',
      }),
    ).rejects.toThrow('payments must exactly equal');

    await expect(
      prisma.client.pharmacySale.count({
        where: { tenantId, providerId, lines: { some: { productId: fixture.productId } } },
      }),
    ).resolves.toBe(0);
    const futureBatch = await prisma.client.batch.findUniqueOrThrow({
      where: { id: fixture.batchIds[1] },
      select: { onHandQuantity: true },
    });
    expect(futureBatch.onHandQuantity).toBe(1);
  });

  it('rolls back inventory, payment, invoice and sequence work when the audit write fails', async () => {
    const fixture = await stockFixture({
      label: 'Audit rollback',
      batches: [{ onHand: 4, held: 0, expiry: '2030-01-01T00:00:00.000Z' }],
    });
    const failingAudit = {
      appendTenantUser: async () => {
        throw new Error('forced-audit-failure');
      },
    } as unknown as AuditWriter;
    const failingService = new PosCheckoutService(
      prisma,
      failingAudit,
      new PosEventWriter(),
      new InventoryEventWriter(),
      new PharmacyVerificationEligibilityEvaluator(prisma),
    );

    await expect(
      failingService.checkout({
        actor,
        providerId,
        idempotencyKey: `checkout-${randomUUID()}`,
        lines: [{ productId: fixture.productId, quantity: 1 }],
        payments: [{ method: 'CASH', amount: '100.00' }],
        placeOfSupplyStateCode: '33',
      }),
    ).rejects.toThrow('forced-audit-failure');

    const [batch, saleCount, movementCount, invoiceCount] = await Promise.all([
      prisma.client.batch.findUniqueOrThrow({
        where: { id: fixture.batchIds[0] },
        select: { onHandQuantity: true },
      }),
      prisma.client.pharmacySale.count({
        where: { tenantId, providerId, lines: { some: { productId: fixture.productId } } },
      }),
      prisma.client.stockMovement.count({
        where: { tenantId, providerId, productId: fixture.productId, type: 'STOCK_OUT' },
      }),
      prisma.client.pharmacyInvoice.count({
        where: {
          tenantId,
          providerId,
          sale: { lines: { some: { productId: fixture.productId } } },
        },
      }),
    ]);
    expect(batch.onHandQuantity).toBe(4);
    expect({ saleCount, movementCount, invoiceCount }).toEqual({
      saleCount: 0,
      movementCount: 0,
      invoiceCount: 0,
    });
  });

  it('prevents concurrent oversell and issues unique invoice numbers under concurrent valid checkouts', async () => {
    const constrained = await stockFixture({
      label: 'Oversell',
      batches: [{ onHand: 5, held: 0, expiry: '2030-01-01T00:00:00.000Z' }],
    });
    const oversell = await Promise.allSettled([
      checkout(constrained.productId, 4, `checkout-${randomUUID()}`, '400.00'),
      checkout(constrained.productId, 4, `checkout-${randomUUID()}`, '400.00'),
    ]);
    expect(oversell.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(oversell.filter((result) => result.status === 'rejected')).toHaveLength(1);
    const constrainedBatch = await prisma.client.batch.findUniqueOrThrow({
      where: { id: constrained.batchIds[0] },
      select: { onHandQuantity: true },
    });
    expect(constrainedBatch.onHandQuantity).toBe(1);

    const ample = await stockFixture({
      label: 'Invoice concurrency',
      batches: [{ onHand: 10, held: 0, expiry: '2031-01-01T00:00:00.000Z' }],
    });
    const [first, second] = await Promise.all([
      checkout(ample.productId, 1, `checkout-${randomUUID()}`, '100.00'),
      checkout(ample.productId, 1, `checkout-${randomUUID()}`, '100.00'),
    ]);
    expect(first.invoice.invoiceNumber).not.toBe(second.invoice.invoiceNumber);
    expect(new Set([first.invoice.invoiceNumber, second.invoice.invoiceNumber]).size).toBe(2);
  });

  it('atomically converts a READY reservation without double-consuming its held stock', async () => {
    const fixture = await stockFixture({
      label: 'Reservation',
      batches: [{ onHand: 5, held: 2, expiry: '2030-01-01T00:00:00.000Z' }],
    });
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
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        confirmedAt: new Date('2026-01-02T00:00:00.000Z'),
        readyAt: new Date('2026-01-03T00:00:00.000Z'),
        expiresAt: new Date('2030-01-01T00:00:00.000Z'),
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
        batchId: fixture.batchIds[0],
        providerId,
        productId: fixture.productId,
        quantity: 2,
        status: 'HELD',
      },
    });

    const key = `checkout-${randomUUID()}`;
    const command = {
      actor,
      providerId,
      idempotencyKey: key,
      lines: [{ productId: fixture.productId, quantity: 2 }],
      payments: [{ method: 'CASH' as const, amount: '200.00' }],
      reservationId,
      placeOfSupplyStateCode: '33',
    };
    const first = await service.checkout(command);
    const replay = await service.checkout(command);

    const [batch, reservation, allocation, movementCount] = await Promise.all([
      prisma.client.batch.findUniqueOrThrow({
        where: { id: fixture.batchIds[0] },
        select: { onHandQuantity: true, heldQuantity: true },
      }),
      prisma.client.medicineReservation.findUniqueOrThrow({
        where: { id: reservationId },
        select: { status: true, version: true },
      }),
      prisma.client.medicineReservationAllocation.findUniqueOrThrow({
        where: { id: allocationId },
        select: { status: true, consumedAt: true },
      }),
      prisma.client.stockMovement.count({
        where: {
          referenceType: 'pharmacy.sale.checkout.reservation',
          referenceId: first.saleId,
        },
      }),
    ]);
    expect(replay).toMatchObject({ saleId: first.saleId, replayed: true });
    expect(batch).toEqual({ onHandQuantity: 3, heldQuantity: 0 });
    expect(reservation).toEqual({ status: 'COMPLETED', version: 3 });
    expect(allocation.status).toBe('CONSUMED');
    expect(allocation.consumedAt).not.toBeNull();
    expect(movementCount).toBe(1);
  });

  it('voids once, restores stock exactly once, keeps invoice immutable and records reprint evidence', async () => {
    const fixture = await stockFixture({
      label: 'Void',
      batches: [{ onHand: 5, held: 0, expiry: '2030-01-01T00:00:00.000Z' }],
    });
    const sale = await checkout(fixture.productId, 2, `checkout-${randomUUID()}`, '200.00');

    const reprinted = await service.reprintInvoice({
      actor,
      providerId,
      saleId: sale.saleId,
    });
    expect(reprinted.invoice.reprintCount).toBe(1);

    const voidKey = `pos-void-${sale.saleId}`;
    const firstVoid = await service.voidSale({
      actor,
      providerId,
      saleId: sale.saleId,
      idempotencyKey: voidKey,
      reason: 'Counter correction',
    });
    const replayVoid = await service.voidSale({
      actor,
      providerId,
      saleId: sale.saleId,
      idempotencyKey: voidKey,
      reason: 'Counter correction',
    });

    expect(firstVoid.status).toBe('VOIDED');
    expect(replayVoid).toMatchObject({ status: 'VOIDED', replayed: true });
    const [batch, movementCount, voidCount] = await Promise.all([
      prisma.client.batch.findUniqueOrThrow({
        where: { id: fixture.batchIds[0] },
        select: { onHandQuantity: true },
      }),
      prisma.client.stockMovement.count({
        where: {
          referenceId: sale.saleId,
          referenceType: { in: ['pharmacy.sale.checkout', 'pharmacy.sale.void'] },
        },
      }),
      prisma.client.pharmacySaleVoid.count({ where: { saleId: sale.saleId } }),
    ]);
    expect(batch.onHandQuantity).toBe(5);
    expect(movementCount).toBe(2);
    expect(voidCount).toBe(1);
  });

  it('fails closed for prescription products and providers outside the trusted assignment', async () => {
    const prescription = await stockFixture({
      label: 'Prescription',
      requiresPrescription: true,
      batches: [{ onHand: 3, held: 0, expiry: '2030-01-01T00:00:00.000Z' }],
    });
    await expect(
      checkout(prescription.productId, 1, `checkout-${randomUUID()}`, '100.00'),
    ).rejects.toThrow('clinical dispensing workflow');

    const otherProviderId = randomUUID();
    await prisma.client.provider.create({
      data: {
        id: otherProviderId,
        tenantId,
        providerType: 'PHARMACY',
        businessName: 'Unassigned Task 0043 Pharmacy',
        ownerName: 'Other Owner',
        email: `${otherProviderId}@task0043.invalid`,
        phone: '0000000044',
        address: 'Other address',
        city: 'Chennai',
        state: 'Tamil Nadu',
        country: 'India',
        postalCode: '600002',
        latitude: 13.08,
        longitude: 80.27,
        isActive: true,
      },
    });
    await expect(service.getSale(actor, otherProviderId, randomUUID())).rejects.toBeTruthy();
  });

  async function checkout(productId: string, quantity: number, key: string, amount: string) {
    return service.checkout({
      actor,
      providerId,
      idempotencyKey: key,
      lines: [{ productId, quantity }],
      payments: [{ method: 'CASH', amount }],
      placeOfSupplyStateCode: '33',
    });
  }

  async function stockFixture(input: {
    label: string;
    requiresPrescription?: boolean;
    batches: Array<{ onHand: number; held: number; expiry: string }>;
  }): Promise<{ productId: string; inventoryId: string; batchIds: string[] }> {
    const productId = randomUUID();
    const inventoryId = randomUUID();
    await prisma.client.product.create({
      data: {
        id: productId,
        name: `Task 0043 ${input.label} Medicine`,
        genericName: `Generic ${input.label}`,
        brand: `Brand ${input.label}`,
        category: 'MEDICINE',
        manufacturer: 'Fixture Manufacturer',
        dosageForm: 'TABLET',
        strength: '10 mg',
        requiresPrescription: input.requiresPrescription ?? false,
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
    const batchIds: string[] = [];
    for (let index = 0; index < input.batches.length; index += 1) {
      const batch = input.batches[index]!;
      const id = randomUUID();
      batchIds.push(id);
      const expiryDate = new Date(batch.expiry);
      const manufacturingDate = new Date(expiryDate);
      manufacturingDate.setUTCFullYear(manufacturingDate.getUTCFullYear() - 1);

      await prisma.client.batch.create({
        data: {
          id,
          tenantId,
          inventoryId,
          providerId,
          productId,
          batchNumber: `T43-${input.label.replaceAll(' ', '-')}-${index}-${randomUUID()}`,
          manufacturingDate,
          expiryDate,
          receivedQuantity: batch.onHand,
          onHandQuantity: batch.onHand,
          heldQuantity: batch.held,
          purchasePrice: '80.00',
          sellingPrice: '100.00',
          status: 'ACTIVE',
        },
      });
    }
    return { productId, inventoryId, batchIds };
  }
});
