import { Test, TestingModule } from '@nestjs/testing';
import { MarketplaceService } from './marketplace.service';
import { MarketplaceRepository } from './marketplace.repository';
import { OutboxService } from '@medsphere/event-bus';
import { NotFoundException, BadRequestException } from '@nestjs/common';

describe('MarketplaceService', () => {
  let service: MarketplaceService;
  let repository: jest.Mocked<MarketplaceRepository>;

  const mockRepository = {
    createPharmacyStore: jest.fn(),
    findPharmacyStoreById: jest.fn(),
    findPharmacyStoresByTenant: jest.fn(),
    updatePharmacyStore: jest.fn(),
    createMarketplaceProduct: jest.fn(),
    findMarketplaceProductById: jest.fn(),
    updateMarketplaceProduct: jest.fn(),
    findMarketplaceProductsByProduct: jest.fn(),
    searchMarketplaceProducts: jest.fn(),
    createCart: jest.fn(),
    findCartById: jest.fn(),
    findActiveCartByPatient: jest.fn(),
    updateCartStatus: jest.fn(),
    addCartItem: jest.fn(),
    findCartItem: jest.fn(),
    updateCartItem: jest.fn(),
    removeCartItem: jest.fn(),
    createOrder: jest.fn(),
    findOrderById: jest.fn(),
    findOrdersByPatient: jest.fn(),
    updateOrderStatus: jest.fn(),
    createOrderItem: jest.fn(),
    createDeliveryAssignment: jest.fn(),
    findDeliveryAssignmentByOrder: jest.fn(),
    updateDeliveryStatus: jest.fn(),
    findNearbyPharmacyStores: jest.fn(),
    createOutboxEvent: jest.fn(),
  };

  let mockOutboxService = {
    publish: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MarketplaceService,
        { provide: MarketplaceRepository, useValue: mockRepository },
        { provide: OutboxService, useValue: mockOutboxService },
      ],
    }).compile();

    service = module.get<MarketplaceService>(MarketplaceService);
    repository = module.get(MarketplaceRepository);
    mockOutboxService = module.get(OutboxService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // === Pharmacy Store Tests ===

  describe('createPharmacyStore', () => {
    it('should create a pharmacy store and emit event', async () => {
      const dto = {
        tenantId: 'tenant-123',
        name: 'City Pharmacy',
        address: '123 Main St',
        latitude: 40.7128,
        longitude: -74.006,
      };
      const mockStore = { id: 'store-1', ...dto };
      repository.createPharmacyStore.mockResolvedValue(mockStore as never);
      repository.createOutboxEvent.mockResolvedValue({ id: 'event-1' } as never);

      const result = await service.createPharmacyStore(dto);

      expect(repository.createPharmacyStore).toHaveBeenCalledWith({
        tenantId: dto.tenantId,
        name: dto.name,
        description: null,
        address: dto.address,
        latitude: dto.latitude,
        longitude: dto.longitude,
        operatingHours: undefined,
        deliveryRadiusKm: 10,
        supportsPickup: true,
        supportsDelivery: true,
      });
      expect(repository.createOutboxEvent).toHaveBeenCalled();
      expect(result).toEqual(mockStore);
    });
  });

  describe('findPharmacyStoreById', () => {
    it('should return store if found', async () => {
      const mockStore = { id: 'store-1', name: 'Pharmacy' };
      repository.findPharmacyStoreById.mockResolvedValue(mockStore as never);

      const result = await service.findPharmacyStoreById('store-1');
      expect(result).toEqual(mockStore);
    });

    it('should throw NotFoundException if not found', async () => {
      repository.findPharmacyStoreById.mockResolvedValue(null);

      await expect(service.findPharmacyStoreById('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  // === Marketplace Product Tests ===

  describe('createMarketplaceProduct', () => {
    it('should create product when pharmacy exists', async () => {
      const dto = {
        tenantId: 'tenant-123',
        pharmacyId: 'pharmacy-1',
        productId: 'product-1',
        sellingPrice: 15.99,
        availableQuantity: 100,
      };
      repository.findPharmacyStoreById.mockResolvedValue({ id: 'pharmacy-1' } as never);
      repository.createMarketplaceProduct.mockResolvedValue({ id: 'mp-1', ...dto } as never);
      repository.createOutboxEvent.mockResolvedValue({ id: 'event-1' } as never);

      const result = await service.createMarketplaceProduct(dto);

      expect(repository.createMarketplaceProduct).toHaveBeenCalledWith({
        tenantId: dto.tenantId,
        pharmacyId: dto.pharmacyId,
        productId: dto.productId,
        sellingPrice: dto.sellingPrice,
        availableQuantity: dto.availableQuantity,
        estimatedPreparationTime: 30,
        visibility: 'PUBLIC',
      });
      expect(result).toHaveProperty('id', 'mp-1');
    });

    it('should throw NotFoundException when pharmacy not found', async () => {
      repository.findPharmacyStoreById.mockResolvedValue(null);

      await expect(
        service.createMarketplaceProduct({
          tenantId: 't1',
          pharmacyId: 'nonexistent',
          productId: 'p1',
          sellingPrice: 10,
          availableQuantity: 5,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // === Cart Tests ===

  describe('getOrCreateCart', () => {
    it('should return existing active cart', async () => {
      const mockCart = { id: 'cart-1', items: [] };
      repository.findActiveCartByPatient.mockResolvedValue(mockCart as never);

      const result = await service.getOrCreateCart('t1', 'p1');

      expect(repository.findActiveCartByPatient).toHaveBeenCalledWith('t1', 'p1');
      expect(repository.createCart).not.toHaveBeenCalled();
      expect(result).toEqual(mockCart);
    });

    it('should create new cart when none exists', async () => {
      const mockCart = { id: 'cart-1', items: [] };
      repository.findActiveCartByPatient.mockResolvedValue(null);
      repository.createCart.mockResolvedValue(mockCart as never);
      repository.createOutboxEvent.mockResolvedValue({ id: 'e1' } as never);

      const result = await service.getOrCreateCart('t1', 'p1');

      expect(repository.createCart).toHaveBeenCalledWith({ tenantId: 't1', patientId: 'p1' });
      expect(repository.createOutboxEvent).toHaveBeenCalled();
      expect(result).toEqual(mockCart);
    });
  });

  describe('addToCart', () => {
    it('should add new item to cart', async () => {
      const mockCart = { id: 'cart-1', items: [] };
      repository.findActiveCartByPatient.mockResolvedValue(mockCart as never);
      repository.findCartItem.mockResolvedValue(null);
      repository.addCartItem.mockResolvedValue({ id: 'item-1' } as never);
      repository.findCartById.mockResolvedValue({ id: 'cart-1', items: [] } as never);
      repository.createOutboxEvent.mockResolvedValue({ id: 'e1' } as never);

      const result = await service.addToCart({
        tenantId: 't1',
        patientId: 'p1',
        productId: 'prod-1',
        quantity: 2,
      });

      expect(repository.addCartItem).toHaveBeenCalledWith({
        cartId: 'cart-1',
        productId: 'prod-1',
        requestedQuantity: 2,
        selectedPharmacyId: null,
      });
      expect(result).toEqual({ id: 'cart-1', items: [] });
    });

    it('should update existing item quantity', async () => {
      const mockCart = { id: 'cart-1', items: [] };
      repository.findActiveCartByPatient.mockResolvedValue(mockCart as never);
      repository.findCartItem.mockResolvedValue({ id: 'item-1', requestedQuantity: 3 } as never);
      repository.updateCartItem.mockResolvedValue({ id: 'item-1', requestedQuantity: 5 } as never);
      repository.findCartById.mockResolvedValue({ id: 'cart-1', items: [] } as never);
      repository.createOutboxEvent.mockResolvedValue({ id: 'e1' } as never);

      await service.addToCart({
        tenantId: 't1',
        patientId: 'p1',
        productId: 'prod-1',
        quantity: 2,
      });

      expect(repository.updateCartItem).toHaveBeenCalledWith('item-1', {
        requestedQuantity: 5,
        selectedPharmacyId: null,
      });
    });
  });

  describe('getCart', () => {
    it('should return cart if found', async () => {
      const mockCart = { id: 'cart-1', items: [] };
      repository.findCartById.mockResolvedValue(mockCart as never);

      const result = await service.getCart('cart-1');
      expect(result).toEqual(mockCart);
    });

    it('should throw NotFoundException if not found', async () => {
      repository.findCartById.mockResolvedValue(null);

      await expect(service.getCart('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  // === Fulfillment Tests ===

  describe('calculateFulfillmentOptions', () => {
    it('should throw NotFoundException for non-existent cart', async () => {
      repository.findCartById.mockResolvedValue(null);

      await expect(
        service.calculateFulfillmentOptions({ tenantId: 't1', cartId: 'nonexistent' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException for empty cart', async () => {
      repository.findCartById.mockResolvedValue({ id: 'cart-1', items: [] } as never);

      await expect(
        service.calculateFulfillmentOptions({ tenantId: 't1', cartId: 'cart-1' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // === Order Tests ===

  describe('findOrderById', () => {
    it('should return order if found', async () => {
      const mockOrder = { id: 'order-1', orderNumber: 'MKT-001' };
      repository.findOrderById.mockResolvedValue(mockOrder as never);

      const result = await service.findOrderById('order-1');
      expect(result).toEqual(mockOrder);
    });

    it('should throw NotFoundException if not found', async () => {
      repository.findOrderById.mockResolvedValue(null);

      await expect(service.findOrderById('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('cancelOrder', () => {
    it('should cancel order and emit event', async () => {
      const mockOrder = { id: 'order-1', orderNumber: 'MKT-001', tenantId: 't1' };
      repository.findOrderById.mockResolvedValue(mockOrder as never);
      repository.updateOrderStatus.mockResolvedValue({
        ...mockOrder,
        status: 'CANCELLED',
      } as never);
      repository.createOutboxEvent.mockResolvedValue({ id: 'e1' } as never);

      const result = await service.cancelOrder('order-1', 't1');

      expect(repository.updateOrderStatus).toHaveBeenCalledWith('order-1', 'CANCELLED');
      expect(repository.createOutboxEvent).toHaveBeenCalled();
      expect(result?.status).toBe('CANCELLED');
    });

    it('should throw NotFoundException for non-existent order', async () => {
      repository.findOrderById.mockResolvedValue(null);

      await expect(service.cancelOrder('nonexistent', 't1')).rejects.toThrow(NotFoundException);
    });
  });

  // === Delivery Tests ===

  describe('findDeliveryAssignment', () => {
    it('should return assignment if found', async () => {
      const mockAssignment = { id: 'da-1', orderId: 'order-1' };
      repository.findDeliveryAssignmentByOrder.mockResolvedValue(mockAssignment as never);

      const result = await service.findDeliveryAssignment('order-1');
      expect(result).toEqual(mockAssignment);
    });

    it('should throw NotFoundException if not found', async () => {
      repository.findDeliveryAssignmentByOrder.mockResolvedValue(null);

      await expect(service.findDeliveryAssignment('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // === Recommendation Tests ===

  describe('findNearbyPharmacies', () => {
    it('should return nearby pharmacies', async () => {
      const mockStores = [{ id: 'store-1', name: 'Nearby Pharmacy' }];
      repository.findNearbyPharmacyStores.mockResolvedValue(mockStores as never);

      const result = await service.findNearbyPharmacies({
        tenantId: 't1',
        latitude: 40.7128,
        longitude: -74.006,
      });

      expect(repository.findNearbyPharmacyStores).toHaveBeenCalledWith(
        't1',
        40.7128,
        -74.006,
        10,
        undefined,
        undefined,
      );
      expect(result).toEqual(mockStores);
    });
  });

  describe('comparePrices', () => {
    it('should return price comparison data', async () => {
      const mockProducts = [
        {
          productId: 'prod-1',
          pharmacyId: 'pharmacy-1',
          pharmacy: { name: 'Pharmacy A' },
          sellingPrice: 15.99,
          availableQuantity: 100,
          estimatedPreparationTime: 30,
        },
      ];
      repository.findMarketplaceProductsByProduct.mockResolvedValue(mockProducts as never);

      const result = await service.comparePrices({
        tenantId: 't1',
        productId: 'prod-1',
      });

      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty('sellingPrice', 15.99);
    });
  });
});
