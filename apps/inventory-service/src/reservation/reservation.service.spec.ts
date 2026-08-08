import { Test, TestingModule } from '@nestjs/testing';
import { ReservationService, ReservationStatus } from './reservation.service';
import { PrismaService } from '../prisma/prisma.service';
import { AvailabilityService } from '../availability/availability.service';
import { FefoService } from '../fefo/fefo.service';
import { InventoryRepository } from '../inventory/inventory.repository';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AvailabilityStatus } from '../availability/config/availability.config';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MockFn = jest.Mock<any, any>;

describe('ReservationService (inventory-service) — legacy characterization', () => {
  let service: ReservationService;
  let prisma: {
    client: {
      $transaction: MockFn;
      reservation: Record<string, MockFn>;
      inventory: Record<string, MockFn>;
    };
  };
  let availabilityService: jest.Mocked<AvailabilityService>;
  let fefoService: jest.Mocked<FefoService>;
  let inventoryRepository: jest.Mocked<InventoryRepository>;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mockInventoryItem: any = {
    id: 'inventory-1',
    providerId: 'provider-1',
    productId: 'product-1',
    quantity: 100,
    reservedQuantity: 10,
    batchNumber: 'BATCH-001',
    expiryDate: new Date('2027-12-31'),
    sellingPrice: 25.0,
    mrp: 30.0,
    discountPercentage: 0,
    taxPercentage: 0,
    minimumStockLevel: 10,
    inStock: true,
    isVisible: true,
    sku: null,
    version: 1,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    deletedAt: null,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mockReservationRecord: any = {
    id: 'reservation-1',
    userId: 'user-1',
    providerId: 'provider-1',
    reservationType: 'MEDICINE_PICKUP',
    status: 'PENDING',
    scheduledAt: new Date(),
    notes: JSON.stringify({
      productId: 'product-1',
      quantity: 5,
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      userNotes: 'Test notes',
    }),
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  beforeEach(async () => {
    prisma = {
      client: {
        $transaction: jest.fn(),
        reservation: {
          findFirst: jest.fn(),
          create: jest.fn(),
          findUnique: jest.fn(),
          findMany: jest.fn(),
          count: jest.fn(),
          update: jest.fn(),
        },
        inventory: {
          findMany: jest.fn(),
        },
      },
    };

    const mockAvailability = {
      create: jest.fn(),
      getProductAvailability: jest.fn(),
    };

    const mockFefo = { allocate: jest.fn() };

    const mockInventoryRepo = {
      create: jest.fn(),
      findById: jest.fn(),
      findAll: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
      countByProvider: jest.fn(),
      countOutOfStock: jest.fn(),
      countLowStock: jest.fn(),
      getInventoryValue: jest.fn(),
      findFefoBatches: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReservationService,
        { provide: PrismaService, useValue: prisma },
        { provide: AvailabilityService, useValue: mockAvailability },
        { provide: FefoService, useValue: mockFefo },
        { provide: InventoryRepository, useValue: mockInventoryRepo },
      ],
    }).compile();

    service = module.get<ReservationService>(ReservationService);
    availabilityService = module.get(AvailabilityService);
    fefoService = module.get(FefoService);
    inventoryRepository = module.get(InventoryRepository);
  });

  describe('createReservation — legacy characterization', () => {
    it('should reject non-positive quantities', async () => {
      // Legacy characterization: quantity <= 0 is rejected
      await expect(
        service.createReservation({
          userId: 'user-1',
          providerId: 'provider-1',
          productId: 'product-1',
          quantity: 0,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject insufficient stock', async () => {
      // Legacy characterization: insufficient sellable stock is rejected
      availabilityService.getProductAvailability.mockResolvedValue({
        sellableQuantity: 3,
        status: AvailabilityStatus.IN_STOCK as string,
        productId: 'product-1',
        productName: 'Test',
        brand: 'Test',
        category: 'MEDICINE',
        genericName: null,
        pharmacyId: 'provider-1',
        pharmacyName: 'Test Pharmacy',
        availableQuantity: 3,
        reservedQuantity: 0,
        totalBatches: 1,
        expiredBatches: 0,
        minimumStockLevel: 10,
      });

      await expect(
        service.createReservation({
          userId: 'user-1',
          providerId: 'provider-1',
          productId: 'product-1',
          quantity: 10,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject unavailable product', async () => {
      // Legacy characterization: UNAVAILABLE status is rejected
      availabilityService.getProductAvailability.mockResolvedValue({
        sellableQuantity: 0,
        status: AvailabilityStatus.UNAVAILABLE as string,
        productId: 'product-1',
        productName: 'Test',
        brand: 'Test',
        category: 'MEDICINE',
        genericName: null,
        pharmacyId: 'provider-1',
        pharmacyName: 'Test Pharmacy',
        availableQuantity: 0,
        reservedQuantity: 0,
        totalBatches: 0,
        expiredBatches: 0,
        minimumStockLevel: 0,
      });

      await expect(
        service.createReservation({
          userId: 'user-1',
          providerId: 'provider-1',
          productId: 'product-1',
          quantity: 1,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should encode product, quantity, and expiry into JSON notes', async () => {
      // Legacy characterization: structured data is embedded in JSON notes
      // This is rejected by ADR-005 which requires typed columns
      availabilityService.getProductAvailability.mockResolvedValue({
        sellableQuantity: 100,
        status: AvailabilityStatus.IN_STOCK as unknown as string,
        productId: 'product-1',
        productName: 'Test',
        brand: 'Test',
        category: 'MEDICINE',
        genericName: null,
        pharmacyId: 'provider-1',
        pharmacyName: 'Test Pharmacy',
        availableQuantity: 100,
        reservedQuantity: 10,
        totalBatches: 1,
        expiredBatches: 0,
        minimumStockLevel: 10,
      });
      prisma.client.reservation.findFirst.mockResolvedValue(null);
      prisma.client.$transaction.mockImplementation((cb: (tx: unknown) => Promise<unknown>) =>
        cb(prisma.client),
      );
      prisma.client.inventory.findMany.mockResolvedValue([mockInventoryItem]);
      inventoryRepository.update.mockResolvedValue(mockInventoryItem);

      // Capture the actual notes JSON passed to reservation.create
      let capturedNotes = '';
      prisma.client.reservation.create.mockImplementation((args: { data: { notes: string } }) => {
        capturedNotes = args.data.notes;
        return mockReservationRecord;
      });

      await service.createReservation({
        userId: 'user-1',
        providerId: 'provider-1',
        productId: 'product-1',
        quantity: 5,
        notes: 'Test notes',
      });

      // The notes field contains JSON with productId, quantity, etc.
      const parsedNotes = JSON.parse(capturedNotes);
      expect(parsedNotes.productId).toBe('product-1');
      expect(parsedNotes.quantity).toBe(5);
      expect(parsedNotes.expiresAt).toBeDefined();
      expect(parsedNotes.userNotes).toBe('Test notes');
    });

    it('should select the first inventory row when several exist', async () => {
      // Legacy characterization: inventoryItems[0] is used without FEFO or batch selection
      // This is rejected by ADR-005 which requires deterministic FEFO allocation
      availabilityService.getProductAvailability.mockResolvedValue({
        sellableQuantity: 100,
        status: 'IN_STOCK',
        productId: 'product-1',
        productName: 'Test',
        brand: 'Test',
        category: 'MEDICINE',
        genericName: null,
        pharmacyId: 'provider-1',
        pharmacyName: 'Test Pharmacy',
        availableQuantity: 150,
        reservedQuantity: 0,
        totalBatches: 2,
        expiredBatches: 0,
        minimumStockLevel: 10,
      });
      prisma.client.reservation.findFirst.mockResolvedValue(null);
      prisma.client.$transaction.mockImplementation((cb: (tx: unknown) => Promise<unknown>) =>
        cb(prisma.client),
      );
      prisma.client.inventory.findMany.mockResolvedValue([
        { ...mockInventoryItem, id: 'inventory-first', quantity: 50, reservedQuantity: 0 },
        { ...mockInventoryItem, id: 'inventory-second', quantity: 100, reservedQuantity: 0 },
      ]);
      inventoryRepository.update.mockResolvedValue(mockInventoryItem);
      prisma.client.reservation.create.mockResolvedValue(mockReservationRecord);

      await service.createReservation({
        userId: 'user-1',
        providerId: 'provider-1',
        productId: 'product-1',
        quantity: 5,
      });

      // Only the first inventory row is updated
      expect(inventoryRepository.update).toHaveBeenCalledWith('inventory-first', {
        reservedQuantity: 5,
      });
    });

    it('should write reserved quantity through InventoryRepository', async () => {
      // Legacy characterization: reservedQuantity is written via InventoryRepository.update
      availabilityService.getProductAvailability.mockResolvedValue({
        sellableQuantity: 100,
        status: 'IN_STOCK',
        productId: 'product-1',
        productName: 'Test',
        brand: 'Test',
        category: 'MEDICINE',
        genericName: null,
        pharmacyId: 'provider-1',
        pharmacyName: 'Test Pharmacy',
        availableQuantity: 100,
        reservedQuantity: 10,
        totalBatches: 1,
        expiredBatches: 0,
        minimumStockLevel: 10,
      });
      prisma.client.reservation.findFirst.mockResolvedValue(null);
      prisma.client.$transaction.mockImplementation((cb: (tx: unknown) => Promise<unknown>) =>
        cb(prisma.client),
      );
      prisma.client.inventory.findMany.mockResolvedValue([mockInventoryItem]);
      inventoryRepository.update.mockResolvedValue(mockInventoryItem);
      prisma.client.reservation.create.mockResolvedValue(mockReservationRecord);

      await service.createReservation({
        userId: 'user-1',
        providerId: 'provider-1',
        productId: 'product-1',
        quantity: 5,
      });

      expect(inventoryRepository.update).toHaveBeenCalledWith('inventory-1', {
        reservedQuantity: 15,
      });
    });

    it('should use $transaction but repositories may use root client', async () => {
      // Legacy characterization: $transaction receives a callback, but
      // InventoryRepository.update uses its own PrismaService (root client),
      // not the transaction client. This is rejected by ADR-005.
      availabilityService.getProductAvailability.mockResolvedValue({
        sellableQuantity: 100,
        status: 'IN_STOCK',
        productId: 'product-1',
        productName: 'Test',
        brand: 'Test',
        category: 'MEDICINE',
        genericName: null,
        pharmacyId: 'provider-1',
        pharmacyName: 'Test Pharmacy',
        availableQuantity: 100,
        reservedQuantity: 10,
        totalBatches: 1,
        expiredBatches: 0,
        minimumStockLevel: 10,
      });
      prisma.client.reservation.findFirst.mockResolvedValue(null);
      prisma.client.$transaction.mockImplementation((cb: (tx: unknown) => Promise<unknown>) =>
        cb(prisma.client),
      );
      prisma.client.inventory.findMany.mockResolvedValue([mockInventoryItem]);
      inventoryRepository.update.mockResolvedValue(mockInventoryItem);
      prisma.client.reservation.create.mockResolvedValue(mockReservationRecord);

      const result = await service.createReservation({
        userId: 'user-1',
        providerId: 'provider-1',
        productId: 'product-1',
        quantity: 5,
      });

      expect(result).toBeDefined();
      // inventoryRepository.update does NOT receive the transaction client
      // It uses its own PrismaService.client internally
    });
  });

  describe('completePickup — legacy characterization', () => {
    it('should use clamped reserved-quantity arithmetic', async () => {
      // Legacy characterization: Math.max(0, reservedQuantity - quantity) clamps
      // negative values to zero instead of failing. This is rejected by ADR-005.
      prisma.client.reservation.findUnique.mockResolvedValue({
        ...mockReservationRecord,
        status: 'CONFIRMED',
      });
      prisma.client.$transaction.mockImplementation((cb: (tx: unknown) => Promise<unknown>) =>
        cb(prisma.client),
      );
      prisma.client.inventory.findMany.mockResolvedValue([
        { id: 'inventory-1', reservedQuantity: 3 },
      ]);
      inventoryRepository.update.mockResolvedValue(mockInventoryItem);
      fefoService.allocate.mockResolvedValue({});
      prisma.client.reservation.update.mockResolvedValue({
        ...mockReservationRecord,
        status: 'COMPLETED',
      });

      const result = await service.completePickup('reservation-1', 'user-1');

      // reservedQuantity was 3, quantity is 5, so Math.max(0, 3-5) = 0
      expect(inventoryRepository.update).toHaveBeenCalledWith('inventory-1', {
        reservedQuantity: 0,
      });
      expect(result.status).toBe(ReservationStatus.COMPLETED);
    });
  });

  describe('cancelReservation — legacy characterization', () => {
    it('should reject cancellation of terminal reservations', async () => {
      // Legacy characterization: COMPLETED, CANCELLED, and EXPIRED cannot be cancelled
      prisma.client.reservation.findUnique.mockResolvedValue({
        ...mockReservationRecord,
        status: 'COMPLETED',
      });

      await expect(service.cancelReservation('reservation-1')).rejects.toThrow(BadRequestException);
    });

    it('should use clamped reserved-quantity arithmetic on cancel', async () => {
      // Legacy characterization: Math.max(0, ...) on cancel too
      prisma.client.reservation.findUnique.mockResolvedValue(mockReservationRecord);
      prisma.client.$transaction.mockImplementation((cb: (tx: unknown) => Promise<unknown>) =>
        cb(prisma.client),
      );
      prisma.client.inventory.findMany.mockResolvedValue([
        { id: 'inventory-1', reservedQuantity: 3 },
      ]);
      inventoryRepository.update.mockResolvedValue(mockInventoryItem);
      prisma.client.reservation.update.mockResolvedValue({
        ...mockReservationRecord,
        status: 'CANCELLED',
      });

      const result = await service.cancelReservation('reservation-1');

      // reservedQuantity was 3, quantity is 5, so Math.max(0, 3-5) = 0
      expect(inventoryRepository.update).toHaveBeenCalledWith('inventory-1', {
        reservedQuantity: 0,
      });
      expect(result.status).toBe(ReservationStatus.CANCELLED);
    });
  });

  describe('autoExpireReservations — legacy characterization', () => {
    it('should suppress cancellation failures and continue', async () => {
      // Legacy characterization: auto-expire catches errors and continues
      // This is rejected by ADR-005 which requires atomic, observable expiry
      jest.useFakeTimers().setSystemTime(new Date('2026-12-31T12:00:00Z'));

      const expiredRecord: any = {
        ...mockReservationRecord,
        id: 'reservation-expired',
        notes: JSON.stringify({
          productId: 'product-1',
          quantity: 5,
          expiresAt: new Date('2026-01-01T00:00:00Z').toISOString(),
        }),
      };

      prisma.client.reservation.findMany.mockResolvedValue([expiredRecord]);
      prisma.client.reservation.findUnique.mockResolvedValue(expiredRecord);
      prisma.client.$transaction.mockImplementation((cb: (tx: unknown) => Promise<unknown>) =>
        cb(prisma.client),
      );
      prisma.client.inventory.findMany.mockResolvedValue([
        { id: 'inventory-1', reservedQuantity: 5 },
      ]);
      inventoryRepository.update.mockResolvedValue(mockInventoryItem);
      prisma.client.reservation.update.mockResolvedValue({
        ...expiredRecord,
        status: 'EXPIRED',
      });

      const count = await service.autoExpireReservations();

      expect(count).toBe(1);
      jest.useRealTimers();
    });

    it('should skip reservations that fail cancellation silently', async () => {
      // Legacy characterization: try/catch with empty catch swallows errors
      jest.useFakeTimers().setSystemTime(new Date('2026-12-31T12:00:00Z'));

      const expiredRecord: any = {
        ...mockReservationRecord,
        id: 'reservation-fail',
        notes: JSON.stringify({
          productId: 'product-1',
          quantity: 5,
          expiresAt: new Date('2026-01-01T00:00:00Z').toISOString(),
        }),
      };

      prisma.client.reservation.findMany.mockResolvedValue([expiredRecord]);
      prisma.client.reservation.findUnique.mockResolvedValue(expiredRecord);
      prisma.client.$transaction.mockImplementation(() => {
        throw new Error('Simulated failure');
      });

      const count = await service.autoExpireReservations();

      // Failure is swallowed, count remains 0
      expect(count).toBe(0);
      jest.useRealTimers();
    });
  });

  describe('getReservation — legacy characterization', () => {
    it('should throw NotFoundException for missing reservation', async () => {
      prisma.client.reservation.findUnique.mockResolvedValue(null);

      await expect(service.getReservation('nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException for soft-deleted reservation', async () => {
      prisma.client.reservation.findUnique.mockResolvedValue({
        ...mockReservationRecord,
        deletedAt: new Date(),
      });

      await expect(service.getReservation('reservation-1')).rejects.toThrow(NotFoundException);
    });
  });
});
