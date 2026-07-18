import { Test, TestingModule } from '@nestjs/testing';
import { BatchService } from './batch.service';
import { BatchRepository } from './batch.repository';
import { CreateBatchDto } from './dto/create-batch.dto';
import { UpdateBatchDto } from './dto/update-batch.dto';
import { BatchStatus } from '../common/enums';
import { NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';

describe('BatchService', () => {
  let service: BatchService;
  let repository: jest.Mocked<BatchRepository>;

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

  const mockResponseDto = {
    id: 'batch-1',
    providerId: 'provider-1',
    productId: 'product-1',
    batchNumber: 'BATCH-001',
    manufacturingDate: '2025-01-01T00:00:00.000Z',
    expiryDate: '2027-12-31T00:00:00.000Z',
    initialQuantity: 100,
    currentQuantity: 100,
    purchasePrice: '10.5',
    sellingPrice: '25',
    status: BatchStatus.ACTIVE,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  beforeEach(async () => {
    const mockRepository = {
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [BatchService, { provide: BatchRepository, useValue: mockRepository }],
    }).compile();

    service = module.get<BatchService>(BatchService);
    repository = module.get(BatchRepository);
  });

  describe('create', () => {
    const createDto: CreateBatchDto = {
      providerId: 'provider-1',
      productId: 'product-1',
      batchNumber: 'BATCH-001',
      expiryDate: '2027-12-31',
      initialQuantity: 100,
      purchasePrice: 10.5,
      sellingPrice: 25.0,
    };

    it('should create a batch successfully', async () => {
      repository.findAll.mockResolvedValue([]);
      repository.create.mockResolvedValue(mockBatchRecord);

      const result = await service.create(createDto);

      expect(result).toEqual(mockResponseDto);
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          batchNumber: 'BATCH-001',
          initialQuantity: 100,
          currentQuantity: 100,
          status: BatchStatus.ACTIVE,
        }),
      );
    });

    it('should throw BadRequestException for invalid expiry date', async () => {
      await expect(service.create({ ...createDto, expiryDate: 'not-a-date' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when manufacturing date is after expiry date', async () => {
      await expect(
        service.create({
          ...createDto,
          manufacturingDate: '2028-01-01',
          expiryDate: '2027-01-01',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when initial quantity is 0', async () => {
      await expect(service.create({ ...createDto, initialQuantity: 0 })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when initial quantity is negative', async () => {
      await expect(service.create({ ...createDto, initialQuantity: -5 })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when current quantity exceeds initial quantity', async () => {
      await expect(
        service.create({ ...createDto, initialQuantity: 100, currentQuantity: 150 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException for duplicate batch number', async () => {
      repository.findAll.mockResolvedValue([mockBatchRecord as unknown as Record<string, unknown>]);

      await expect(service.create(createDto)).rejects.toThrow(ConflictException);
    });

    it('should set status to EXPIRED when expiry date is in the past', async () => {
      repository.findAll.mockResolvedValue([]);
      const pastDate = new Date();
      pastDate.setFullYear(pastDate.getFullYear() - 1);
      const pastDateStr = pastDate.toISOString().split('T')[0];

      repository.create.mockResolvedValue({
        ...mockBatchRecord,
        expiryDate: pastDate,
        status: BatchStatus.EXPIRED,
      });

      const result = await service.create({
        ...createDto,
        expiryDate: pastDateStr,
      });

      expect(result.status).toBe(BatchStatus.EXPIRED);
    });

    it('should set status to EXHAUSTED when current quantity is 0', async () => {
      repository.findAll.mockResolvedValue([]);
      repository.create.mockResolvedValue({
        ...mockBatchRecord,
        currentQuantity: 0,
        status: BatchStatus.EXHAUSTED,
      });

      const result = await service.create({
        ...createDto,
        initialQuantity: 100,
        currentQuantity: 0,
      });

      expect(result.status).toBe(BatchStatus.EXHAUSTED);
    });
  });

  describe('findById', () => {
    it('should return a batch by id', async () => {
      repository.findById.mockResolvedValue(mockBatchRecord);

      const result = await service.findById('batch-1');

      expect(result).toEqual(mockResponseDto);
    });

    it('should throw NotFoundException when batch is not found', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.findById('nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when batch is soft-deleted', async () => {
      repository.findById.mockResolvedValue({ ...mockBatchRecord, deletedAt: new Date() });

      await expect(service.findById('batch-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAll', () => {
    it('should return all batches for a provider', async () => {
      repository.findAll.mockResolvedValue([mockBatchRecord]);

      const result = await service.findAll({ providerId: 'provider-1' });

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(mockResponseDto);
    });

    it('should filter out soft-deleted batches', async () => {
      repository.findAll.mockResolvedValue([
        mockBatchRecord,
        { ...mockBatchRecord, id: 'batch-2', deletedAt: new Date() },
      ]);

      const result = await service.findAll({ providerId: 'provider-1' });

      expect(result).toHaveLength(1);
    });

    it('should filter by productId', async () => {
      repository.findAll.mockResolvedValue([mockBatchRecord]);

      await service.findAll({ providerId: 'provider-1', productId: 'product-1' });

      expect(repository.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ productId: 'product-1' }),
      );
    });

    it('should filter by status', async () => {
      repository.findAll.mockResolvedValue([mockBatchRecord]);

      await service.findAll({ providerId: 'provider-1', status: BatchStatus.ACTIVE });

      expect(repository.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ status: BatchStatus.ACTIVE }),
      );
    });
  });

  describe('update', () => {
    const updateDto: UpdateBatchDto = {
      sellingPrice: 30.0,
    };

    it('should update a batch successfully', async () => {
      repository.findById.mockResolvedValue(mockBatchRecord);
      repository.update.mockResolvedValue({ ...mockBatchRecord, sellingPrice: 30.0 });

      const result = await service.update('batch-1', updateDto);

      expect(result.sellingPrice).toBe('30');
    });

    it('should throw NotFoundException when batch does not exist', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.update('nonexistent', updateDto)).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when expired batch is set to ACTIVE', async () => {
      repository.findById.mockResolvedValue({
        ...mockBatchRecord,
        status: BatchStatus.EXPIRED,
      });

      await expect(service.update('batch-1', { status: BatchStatus.ACTIVE })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when current quantity is negative', async () => {
      repository.findById.mockResolvedValue(mockBatchRecord);

      await expect(service.update('batch-1', { currentQuantity: -1 })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when current quantity exceeds initial quantity', async () => {
      repository.findById.mockResolvedValue(mockBatchRecord);

      await expect(service.update('batch-1', { currentQuantity: 200 })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should set status to EXHAUSTED when current quantity becomes 0', async () => {
      repository.findById.mockResolvedValue(mockBatchRecord);
      repository.update.mockResolvedValue({
        ...mockBatchRecord,
        currentQuantity: 0,
        status: BatchStatus.EXHAUSTED,
      });

      const result = await service.update('batch-1', { currentQuantity: 0 });

      expect(result.status).toBe(BatchStatus.EXHAUSTED);
    });

    it('should validate expiry date on update', async () => {
      repository.findById.mockResolvedValue(mockBatchRecord);

      await expect(service.update('batch-1', { expiryDate: 'invalid-date' })).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('remove', () => {
    it('should soft delete a batch', async () => {
      repository.findById.mockResolvedValue(mockBatchRecord);
      repository.softDelete.mockResolvedValue({ ...mockBatchRecord, deletedAt: new Date() });

      await service.remove('batch-1');

      expect(repository.softDelete).toHaveBeenCalledWith('batch-1');
    });

    it('should throw NotFoundException when batch does not exist', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.remove('nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when batch is already deleted', async () => {
      repository.findById.mockResolvedValue({ ...mockBatchRecord, deletedAt: new Date() });

      await expect(service.remove('batch-1')).rejects.toThrow(NotFoundException);
    });
  });
});
