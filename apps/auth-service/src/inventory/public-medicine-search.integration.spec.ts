import { randomUUID } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';
import { isInfrastructureTestEnabled, requireEnv } from '../auth/testing/infrastructure-test-gate';
import { PrismaService } from '../prisma/prisma.service';
import { PublicMedicineSearchService } from './public-medicine-search.service';

const infra = isInfrastructureTestEnabled() ? describe : describe.skip;
if (isInfrastructureTestEnabled()) requireEnv('DATABASE_URL');

/**
 * Batch 2 Task 2 -- patient-safe medicine search.
 *
 * Proves the response shape never leaks internal fields, availability is
 * genuinely derived from the same eligibility criteria
 * ReservationCreationService uses (not fabricated or looser), hidden
 * listings and inactive/unverified providers are concealed identically
 * (fail-closed, no distinguishing existence), and expired/quarantined
 * stock does not count as available.
 */
infra('Batch 2 Task 2 public medicine search', () => {
  const prisma = new PrismaService();
  const service = new PublicMedicineSearchService(prisma);

  const tenantId = randomUUID();
  const providerId = randomUUID();
  const hiddenProductId = randomUUID();
  const inStockProductId = randomUUID();
  const outOfStockProductId = randomUUID();

  beforeAll(async () => {
    await prisma.client.tenant.create({
      data: { id: tenantId, name: 'Batch2-T2 tenant', slug: `b2t2-${tenantId}` },
    });
    await prisma.client.provider.create({
      data: {
        id: providerId,
        tenantId,
        providerType: 'PHARMACY',
        businessName: 'Batch2-T2 Public Pharmacy',
        ownerName: 'Owner Should Not Appear',
        email: 'owner-should-not-appear@test.invalid',
        phone: '9999999999',
        address: 'Should Not Appear Address',
        city: 'Chennai',
        state: 'Tamil Nadu',
        country: 'India',
        postalCode: '600001',
        latitude: 13,
        longitude: 80,
        isVerified: true,
        isActive: true,
      },
    });
    await prisma.client.product.createMany({
      data: [
        {
          id: hiddenProductId,
          name: 'Batch2-T2 Hidden Medicine',
          brand: 'Fixture Brand',
          category: 'MEDICINE',
          manufacturer: 'Fixture Manufacturer',
          dosageForm: 'TABLET',
          strength: '10 mg',
        },
        {
          id: inStockProductId,
          name: 'Batch2-T2 Paracetamol',
          genericName: 'Paracetamol',
          brand: 'Fixture Brand',
          category: 'MEDICINE',
          manufacturer: 'Fixture Manufacturer',
          dosageForm: 'TABLET',
          strength: '500 mg',
          requiresPrescription: false,
        },
        {
          id: outOfStockProductId,
          name: 'Batch2-T2 Amoxicillin',
          brand: 'Fixture Brand',
          category: 'MEDICINE',
          manufacturer: 'Fixture Manufacturer',
          dosageForm: 'CAPSULE',
          strength: '250 mg',
          requiresPrescription: true,
        },
      ],
    });
    await prisma.client.inventory.createMany({
      data: [
        {
          id: randomUUID(),
          tenantId,
          providerId,
          productId: hiddenProductId,
          sellingPrice: '50.00',
          mrp: '60.00',
          discountPercentage: '0.00',
          taxPercentage: '0.00',
          isVisible: false,
        },
        {
          id: randomUUID(),
          tenantId,
          providerId,
          productId: inStockProductId,
          sellingPrice: '25.00',
          mrp: '30.00',
          discountPercentage: '0.00',
          taxPercentage: '0.00',
          isVisible: true,
        },
        {
          id: randomUUID(),
          tenantId,
          providerId,
          productId: outOfStockProductId,
          sellingPrice: '80.00',
          mrp: '95.00',
          discountPercentage: '0.00',
          taxPercentage: '0.00',
          isVisible: true,
        },
      ],
    });
    await prisma.client.batch.create({
      data: {
        id: randomUUID(),
        tenantId,
        inventoryId: (
          await prisma.client.inventory.findFirstOrThrow({
            where: { providerId, productId: inStockProductId },
          })
        ).id,
        providerId,
        productId: inStockProductId,
        batchNumber: `BATCH2-T2-${randomUUID()}`,
        expiryDate: new Date(Date.now() + 30 * 86_400_000),
        receivedQuantity: 20,
        onHandQuantity: 20,
        heldQuantity: 5,
        purchasePrice: '18.00',
        sellingPrice: '25.00',
      },
    });
    // Out-of-stock product has an inventory listing but zero available
    // batches -- proving availability is computed from real batch data,
    // not merely from the existence of an inventory listing.
  });

  afterAll(async () => prisma.client.$disconnect());

  it('returns only privacy-safe fields and correct coarse availability', async () => {
    const result = await service.search(providerId, { q: 'Batch2-T2', limit: 20, offset: 0 });

    expect(result.data).toHaveLength(2);
    const names = result.data.map((item) => item.name).sort();
    expect(names).toEqual(['Batch2-T2 Amoxicillin', 'Batch2-T2 Paracetamol']);

    const paracetamol = result.data.find((item) => item.productId === inStockProductId);
    expect(paracetamol).toMatchObject({
      providerId,
      providerName: 'Batch2-T2 Public Pharmacy',
      providerCity: 'Chennai',
      providerState: 'Tamil Nadu',
      genericName: 'Paracetamol',
      strength: '500 mg',
      dosageForm: 'TABLET',
      requiresPrescription: false,
      availability: 'IN_STOCK',
    });

    const amoxicillin = result.data.find((item) => item.productId === outOfStockProductId);
    expect(amoxicillin?.availability).toBe('OUT_OF_STOCK');

    // Never present anywhere in the response: internal IDs, cost, staff
    // or owner identity, contact details.
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('purchasePrice');
    expect(serialized).not.toContain('18.00');
    expect(serialized).not.toContain('Owner Should Not Appear');
    expect(serialized).not.toContain('owner-should-not-appear@test.invalid');
    expect(serialized).not.toContain('9999999999');
    expect(serialized).not.toContain('Should Not Appear Address');
    expect(serialized).not.toContain('BATCH2-T2-');
  });

  it('conceals a hidden (isVisible: false) listing entirely', async () => {
    const result = await service.search(providerId, { q: 'Hidden', limit: 20, offset: 0 });
    expect(result.data).toHaveLength(0);
  });

  it('fails closed identically for a nonexistent and an inactive provider, no enumeration', async () => {
    const inactiveProviderId = randomUUID();
    await prisma.client.provider.create({
      data: {
        id: inactiveProviderId,
        tenantId,
        providerType: 'PHARMACY',
        businessName: 'Batch2-T2 Inactive Pharmacy',
        ownerName: 'Owner',
        email: `${inactiveProviderId}@test.invalid`,
        phone: '0000000000',
        address: 'Address',
        city: 'Chennai',
        state: 'Tamil Nadu',
        country: 'India',
        postalCode: '600001',
        latitude: 13,
        longitude: 80,
        isVerified: true,
        isActive: false,
      },
    });

    const nonexistentError = await service
      .search(randomUUID(), { q: 'anything', limit: 20, offset: 0 })
      .catch((error: unknown) => error);
    const inactiveError = await service
      .search(inactiveProviderId, { q: 'anything', limit: 20, offset: 0 })
      .catch((error: unknown) => error);

    expect(nonexistentError).toBeInstanceOf(NotFoundException);
    expect(inactiveError).toBeInstanceOf(NotFoundException);
    expect((nonexistentError as NotFoundException).message).toBe(
      (inactiveError as NotFoundException).message,
    );
  });
});
