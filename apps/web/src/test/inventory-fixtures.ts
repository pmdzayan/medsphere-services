export const validProviders = [
  {
    membershipId: 'fcb65cb7-9071-40eb-ab52-878978d9031c',
    providerId: '7f51a0f3-3bd1-45d7-85f3-b8b725969df9',
    businessName: 'Central Pharmacy',
    providerType: 'PHARMACY',
    isActive: true,
  },
] as const;

export const validStockPage = {
  data: [
    {
      inventoryId: 'f63f50dd-49b0-4a77-bc04-f7d00db58dd5',
      productId: '8b4d574f-48c6-4231-8851-e65edc9f9d42',
      name: 'Metformin 500 mg',
      genericName: 'Metformin hydrochloride',
      brand: 'Example Brand',
      sku: 'MET-500',
      sellingPrice: '12.50',
      mrp: '15.00',
      isVisible: true,
      totalOnHandQuantity: 20,
      totalHeldQuantity: 3,
      totalAvailableQuantity: 17,
      batches: [
        {
          id: '73a97ec4-84f8-4a85-a493-b8d6feb84a27',
          batchNumber: 'BATCH-1',
          expiryDate: '2027-08-01T00:00:00.000Z',
          manufacturingDate: null,
          status: 'ACTIVE',
          version: 4,
          onHandQuantity: 20,
          heldQuantity: 3,
          availableQuantity: 17,
        },
      ],
    },
  ],
  total: 1,
  limit: 25,
  offset: 0,
} as const;

export const validExpiryWorklistPage = {
  data: [
    {
      inventoryId: validStockPage.data[0].inventoryId,
      batchId: validStockPage.data[0].batches[0].id,
      productId: validStockPage.data[0].productId,
      name: validStockPage.data[0].name,
      genericName: validStockPage.data[0].genericName,
      brand: validStockPage.data[0].brand,
      sku: validStockPage.data[0].sku,
      isVisible: true,
      batchNumber: validStockPage.data[0].batches[0].batchNumber,
      expiryDate: '2026-08-20T00:00:00.000Z',
      version: 4,
      onHandQuantity: 20,
      heldQuantity: 3,
      availableQuantity: 17,
    },
  ],
  total: 30,
  limit: 25,
  offset: 0,
  asOf: '2026-08-14T00:00:00.000Z',
  horizonEndsAt: '2026-09-13T00:00:00.000Z',
} as const;
