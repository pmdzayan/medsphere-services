import { Test, TestingModule } from '@nestjs/testing';
import { StockMovementService } from './stock-movement.service';
import { StockMovementRepository } from './stock-movement.repository';
import { BatchRepository } from '../batch/batch.repository';
import { InventoryRepository } from '../inventory/inventory.repository';
import { InventoryHistoryRepository } from '../inventory-history/inventory-history.repository';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStockMovementDto } from './dto/create-stock-movement.dto';
import { StockMovementType, BatchStatus } from '../common/enums';
import { NotFoundException, BadRequestException } from '@nestjs/common';

describe('StockMovementService', () => {
  let service: StockMovementService;
  let movementRepository: jest.Mocked<StockMovementRepository>;
  let batchRepository: jest.Mocked<BatchRepository>;
  let inventoryRepository: jest.Mocked<InventoryRepository>;
  let historyRepository: jest.Mocked<InventoryHistoryRepository>;
  const mockInventoryRecord = {
    id: 'inventory-1',
    providerId: 'provider-1',
    productId: 'product-1',
    product: { id: 'product-1', name: 'Test Medicine' },
    quantity: 100,
    reservedQuantity: 0,
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
    stockMovements: [],
  };

  const mockBatchRecord = {
    id: 'batch-1',
    providerId: 'provider-1',
    productId: 'product-1',
    batchNumber: 'BATCH-001',
    manufacturingDate: new Date('2025-01-01'),
    expiryDate: new Date('2027-12-31'),
    initialQuantity: 100,
    currentQuantity: 100,
    purchasePrice: 10.5,
    sellingPrice: 25.0,
    status: BatchStatus.ACTIVE,
    version: 1,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    deletedAt: null,
    product: { id: 'product-1', name: 'Test Medicine' },
  };

  const mockMovementRecord = {
    id: 'movement-1',
    inventoryId: 'inventory-1',
    batchId: 'batch-1',
    providerId: 'provider-1',
    productId: 'product-1',
    type: StockMovementType.STOCK_IN,
    quantity: 50,
    quantityBefore: 100,
    quantityAfter: 150,
    referenceType: null,
    referenceId: null,
    reason: null,
    notes: null,
    userId: 'user-1',
    version: 1,
    createdAt: new Date('2026-07-18'),
    updatedAt: new Date('2026-07-18'),
    deletedAt: null,
    inventory: mockInventoryRecord,
    batch: mockBatchRecord,
  };

  beforeEach(async () => {
    const mockMovementRepository = {
      create: jest.fn(),
      findById: jest.fn(),
      findAll: jest.fn(),
      countByProvider: jest.fn(),
    };

    const mockBatchRepository = {
      create: jest.fn(),
      findById: jest.fn(),
      findAll: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
      countByProvider: jest.fn(),
      countExpired: jest.fn(),
      countExpiringSoon: jest.fn(),
      findActiveBatchesByProduct: jest.fn(),
    };

    const mockInventoryRepository = {
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

    const mockHistoryRepository = {
      create: jest.fn(),
      findByProvider: jest.fn(),
      countByProvider: jest.fn(),
    };

    const mockPrisma = {
      client: {
        $transaction: jest.fn((cb: () => Promise<unknown>) => cb()),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StockMovementService,
        { provide: StockMovementRepository, useValue: mockMovementRepository },
        { provide: BatchRepository, useValue: mockBatchRepository },
        { provide: InventoryRepository, useValue: mockInventoryRepository },
        { provide: InventoryHistoryRepository, useValue: mockHistoryRepository },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<StockMovementService>(StockMovementService);
    movementRepository = module.get(StockMovementRepository);
    batchRepository = module.get(BatchRepository);
    inventoryRepository = module.get(InventoryRepository);
    historyRepository = module.get(InventoryHistoryRepository);
    prisma = module.get(PrismaService);
  });

  describe('create', () => {
    const baseDto: CreateStockMovementDto = {
      inventoryId: 'inventory-1',
      batchId: 'batch-1',
      providerId: 'provider-1',
      productId: 'product-1',
      type: StockMovementType.STOCK_IN,
      quantity: 50,
      quantityBefore: 100,
      quantityAfter: 150,
      userId: 'user-1',
    };

    it('should create a STOCK_IN movement successfully', async () => {
      inventoryRepository.findById.mockResolvedValue(mockInventoryRecord);
      batchRepository.findById.mockResolvedValue(mockBatchRecord);
      movementRepository.create.mockResolvedValue(mockMovementRecord);
      inventoryRepository.update.mockResolvedValue({ ...mockInventoryRecord, quantity: 150 });
      batchRepository.update.mockResolvedValue({ ...mockBatchRecord, currentQuantity: 150 });
      historyRepository.create.mockResolvedValue({});

      const result = await service.create(baseDto);

      expect(result).toBeDefined();
      expect(result.id).toBe('movement-1');
      expect(result.type).toBe(StockMovementType.STOCK_IN);
      expect(movementRepository.create).toHaveBeenCalled();
      expect(inventoryRepository.update).toHaveBeenCalledWith('inventory-1', {
        quantity: 150,
        inStock: true,
      });
      expect(historyRepository.create).toHaveBeenCalled();
    });

    it('should throw NotFoundException when inventory is not found', async () => {
      inventoryRepository.findById.mockResolvedValue(null);

      await expect(service.create(baseDto)).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when inventory is soft-deleted', async () => {
      inventoryRepository.findById.mockResolvedValue({
        ...mockInventoryRecord,
        deletedAt: new Date(),
      });

      await expect(service.create(baseDto)).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when product does not match inventory', async () => {
      inventoryRepository.findById.mockResolvedValue(mockInventoryRecord);

      await expect(service.create({ ...baseDto, productId: 'different-product' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException when batch is not found', async () => {
      inventoryRepository.findById.mockResolvedValue(mockInventoryRecord);
      batchRepository.findById.mockResolvedValue(null);

      await expect(service.create(baseDto)).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when STOCK_OUT on expired batch', async () => {
      inventoryRepository.findById.mockResolvedValue(mockInventoryRecord);
      batchRepository.findById.mockResolvedValue({
        ...mockBatchRecord,
        status: BatchStatus.EXPIRED,
      });

      await expect(
        service.create({ ...baseDto, type: StockMovementType.STOCK_OUT }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when batch product does not match inventory', async () => {
      inventoryRepository.findById.mockResolvedValue(mockInventoryRecord);
      batchRepository.findById.mockResolvedValue({
        ...mockBatchRecord,
        productId: 'different-product',
      });

      await expect(service.create(baseDto)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException on stock underflow for STOCK_OUT', async () => {
      inventoryRepository.findById.mockResolvedValue(mockInventoryRecord);
      batchRepository.findById.mockResolvedValue(mockBatchRecord);

      await expect(
        service.create({ ...baseDto, type: StockMovementType.STOCK_OUT, quantity: 200 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException on stock underflow for DAMAGED', async () => {
      inventoryRepository.findById.mockResolvedValue(mockInventoryRecord);
      batchRepository.findById.mockResolvedValue(mockBatchRecord);

      await expect(
        service.create({ ...baseDto, type: StockMovementType.DAMAGED, quantity: 200 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException on stock underflow for EXPIRED', async () => {
      inventoryRepository.findById.mockResolvedValue(mockInventoryRecord);
      batchRepository.findById.mockResolvedValue(mockBatchRecord);

      await expect(
        service.create({ ...baseDto, type: StockMovementType.EXPIRED, quantity: 200 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException on stock underflow for RETURN_OUT', async () => {
      inventoryRepository.findById.mockResolvedValue(mockInventoryRecord);
      batchRepository.findById.mockResolvedValue(mockBatchRecord);

      await expect(
        service.create({ ...baseDto, type: StockMovementType.RETURN_OUT, quantity: 200 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for invalid adjustment resulting in negative stock', async () => {
      inventoryRepository.findById.mockResolvedValue(mockInventoryRecord);
      batchRepository.findById.mockResolvedValue(mockBatchRecord);

      await expect(
        service.create({ ...baseDto, type: StockMovementType.ADJUSTMENT, quantity: -200 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should handle RETURN_IN like STOCK_IN', async () => {
      inventoryRepository.findById.mockResolvedValue(mockInventoryRecord);
      batchRepository.findById.mockResolvedValue(mockBatchRecord);
      movementRepository.create.mockResolvedValue({
        ...mockMovementRecord,
        type: StockMovementType.RETURN_IN,
      });

      const result = await service.create({
        ...baseDto,
        type: StockMovementType.RETURN_IN,
      });

      expect(result).toBeDefined();
      expect(movementRepository.create).toHaveBeenCalled();
    });

    it('should handle ADJUSTMENT with positive delta', async () => {
      inventoryRepository.findById.mockResolvedValue(mockInventoryRecord);
      batchRepository.findById.mockResolvedValue(mockBatchRecord);
      movementRepository.create.mockResolvedValue({
        ...mockMovementRecord,
        type: StockMovementType.ADJUSTMENT,
        quantity: 10,
        quantityBefore: 100,
        quantityAfter: 110,
      });

      const result = await service.create({
        ...baseDto,
        type: StockMovementType.ADJUSTMENT,
        quantity: 10,
      });

      expect(result).toBeDefined();
      expect(movementRepository.create).toHaveBeenCalled();
    });

    it('should throw BadRequestException for invalid movement type', async () => {
      inventoryRepository.findById.mockResolvedValue(mockInventoryRecord);
      batchRepository.findById.mockResolvedValue(mockBatchRecord);

      await expect(
        service.create({ ...baseDto, type: 'INVALID_TYPE' as StockMovementType }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should work without a batch', async () => {
      inventoryRepository.findById.mockResolvedValue(mockInventoryRecord);
      movementRepository.create.mockResolvedValue({
        ...mockMovementRecord,
        batchId: null,
        batch: null,
      });

      const result = await service.create({ ...baseDto, batchId: undefined });

      expect(result).toBeDefined();
      expect(batchRepository.findById).not.toHaveBeenCalled();
    });
  });

  describe('findById', () => {
    it('should return a movement by id', async () => {
      movementRepository.findById.mockResolvedValue(mockMovementRecord);

      const result = await service.findById('movement-1');

      expect(result).toBeDefined();
      expect(result.id).toBe('movement-1');
    });

    it('should throw NotFoundException when movement is not found', async () => {
      movementRepository.findById.mockResolvedValue(null);

      await expect(service.findById('nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when movement is soft-deleted', async () => {
      movementRepository.findById.mockResolvedValue({
        ...mockMovementRecord,
        deletedAt: new Date(),
      });

      await expect(service.findById('movement-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAll', () => {
    it('should return paginated movements', async () => {
      movementRepository.findAll.mockResolvedValue({
        data: [mockMovementRecord as unknown as Record<string, unknown>],
        total: 1,
        limit: 50,
        offset: 0,
      });

      const result = await service.findAll({ providerId: 'provider-1' });

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.limit).toBe(50);
      expect(result.offset).toBe(0);
    });

    it('should filter out soft-deleted movements', async () => {
      movementRepository.findAll.mockResolvedValue({
        data: [
          mockMovementRecord as unknown as Record<string, unknown>,
          { ...mockMovementRecord, id: 'movement-2', deletedAt: new Date() } as unknown as Record<
            string,
            unknown
          >,
        ],
        total: 2,
        limit: 50,
        offset: 0,
      });

      const result = await service.findAll({ providerId: 'provider-1' });

      expect(result.data).toHaveLength(1);
    });

    it('should pass date range filters', async () => {
      movementRepository.findAll.mockResolvedValue({
        data: [],
        total: 0,
        limit: 50,
        offset: 0,
      });

      await service.findAll({
        providerId: 'provider-1',
        startDate: '2026-01-01',
        endDate: '2026-12-31',
      });

      expect(movementRepository.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          startDate: '2026-01-01',
          endDate: '2026-12-31',
        }),
      );
    });

    it('should pass pagination params', async () => {
      movementRepository.findAll.mockResolvedValue({
        data: [],
        total: 0,
        limit: 10,
        offset: 20,
      });

      await service.findAll({
        providerId: 'provider-1',
        limit: 10,
        offset: 20,
      });

      expect(movementRepository.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 10, offset: 20 }),
      );
    });
  });
});
