export const validReservationPage = {
  data: [
    {
      id: 'f63f50dd-49b0-4a77-bc04-f7d00db58dd5',
      status: 'CONFIRMED',
      version: 2,
      expiresAt: '2027-08-01T12:00:00.000Z',
      createdAt: '2027-08-01T10:00:00.000Z',
      items: [
        {
          productId: '8b4d574f-48c6-4231-8851-e65edc9f9d42',
          name: 'Metformin 500 mg',
          genericName: 'Metformin hydrochloride',
          brand: 'Example Brand',
          quantity: 2,
          allocations: [
            {
              batchId: '73a97ec4-84f8-4a85-a493-b8d6feb84a27',
              batchNumber: 'BATCH-1',
              quantity: 2,
              status: 'HELD',
            },
          ],
        },
      ],
      totalQuantity: 2,
    },
  ],
  total: 1,
  limit: 25,
  offset: 0,
} as const;
