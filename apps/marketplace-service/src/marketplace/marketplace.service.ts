import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { OutboxService } from '@medsphere/event-bus';
import { MarketplaceRepository } from './marketplace.repository';
import {
  CartStatus,
  MarketplaceOrderStatus,
  DeliveryStatus,
  FulfillmentStrategy,
  OptimizationCriteria,
  ProductVisibility,
} from './enums';
import {
  CreatePharmacyStoreDto,
  UpdatePharmacyStoreDto,
  CreateMarketplaceProductDto,
  UpdateMarketplaceProductDto,
  AddToCartDto,
  UpdateCartItemDto,
  CheckoutDto,
  SearchProductsDto,
  NearbyPharmaciesDto,
  PriceComparisonDto,
  MedicineAlternativesDto,
  FulfillmentOptionsDto,
  AssignDeliveryDto,
  UpdateDeliveryStatusDto,
  RecordPaymentDto,
} from './dto/marketplace.dto';

@Injectable()
export class MarketplaceService {
  constructor(
    private readonly repository: MarketplaceRepository,
    private readonly outboxService: OutboxService,
  ) {}

  // === Pharmacy Store Management ===

  async createPharmacyStore(dto: CreatePharmacyStoreDto) {
    const store = await this.repository.createPharmacyStore({
      tenantId: dto.tenantId,
      name: dto.name,
      description: dto.description ?? null,
      address: dto.address,
      latitude: dto.latitude,
      longitude: dto.longitude,
      operatingHours: dto.operatingHours,
      deliveryRadiusKm: dto.deliveryRadiusKm ?? 10,
      supportsPickup: dto.supportsPickup ?? true,
      supportsDelivery: dto.supportsDelivery ?? true,
    });

    await this.repository.createOutboxEvent({
      tenantId: dto.tenantId,
      eventType: 'marketplace.pharmacy.created',
      aggregateType: 'PharmacyStore',
      aggregateId: store.id,
      payload: { storeId: store.id, name: store.name },
    });

    return store;
  }

  async findPharmacyStoreById(id: string) {
    const store = await this.repository.findPharmacyStoreById(id);
    if (!store) throw new NotFoundException('Pharmacy store not found');
    return store;
  }

  async findPharmacyStoresByTenant(tenantId: string, skip?: number, take?: number) {
    return this.repository.findPharmacyStoresByTenant(tenantId, skip, take);
  }

  async updatePharmacyStore(id: string, dto: UpdatePharmacyStoreDto) {
    const store = await this.repository.findPharmacyStoreById(id);
    if (!store) throw new NotFoundException('Pharmacy store not found');
    return this.repository.updatePharmacyStore(id, dto);
  }

  // === Marketplace Product Management ===

  async createMarketplaceProduct(dto: CreateMarketplaceProductDto) {
    const pharmacy = await this.repository.findPharmacyStoreById(dto.pharmacyId);
    if (!pharmacy) throw new NotFoundException('Pharmacy store not found');

    const product = await this.repository.createMarketplaceProduct({
      tenantId: dto.tenantId,
      pharmacyId: dto.pharmacyId,
      productId: dto.productId,
      sellingPrice: dto.sellingPrice,
      availableQuantity: dto.availableQuantity,
      estimatedPreparationTime: dto.estimatedPreparationTime ?? 30,
      visibility: dto.visibility ?? ProductVisibility.PUBLIC,
    });

    await this.repository.createOutboxEvent({
      tenantId: dto.tenantId,
      eventType: 'marketplace.product.listed',
      aggregateType: 'MarketplaceProduct',
      aggregateId: product.id,
      payload: { productId: product.id, pharmacyId: dto.pharmacyId },
    });

    return product;
  }

  async findMarketplaceProductById(id: string) {
    const product = await this.repository.findMarketplaceProductById(id);
    if (!product) throw new NotFoundException('Marketplace product not found');
    return product;
  }

  async updateMarketplaceProduct(id: string, dto: UpdateMarketplaceProductDto) {
    const product = await this.repository.findMarketplaceProductById(id);
    if (!product) throw new NotFoundException('Marketplace product not found');
    return this.repository.updateMarketplaceProduct(id, dto);
  }

  // === Universal Search ===

  async searchProducts(dto: SearchProductsDto) {
    return this.repository.searchMarketplaceProducts({
      tenantId: dto.tenantId,
      query: dto.query,
      brand: dto.brand,
      genericName: dto.genericName,
      category: dto.category,
      sku: dto.sku,
      barcode: dto.barcode,
      pharmacyId: dto.pharmacyId,
      minPrice: dto.minPrice,
      maxPrice: dto.maxPrice,
      limit: dto.limit ?? 50,
      offset: dto.offset ?? 0,
    });
  }

  // === Smart Cart Management ===

  async getOrCreateCart(tenantId: string, patientId: string) {
    let cart = await this.repository.findActiveCartByPatient(tenantId, patientId);
    if (!cart) {
      const newCart = await this.repository.createCart({ tenantId, patientId });
      cart = { ...newCart, items: [] };
      await this.repository.createOutboxEvent({
        tenantId,
        eventType: 'marketplace.cart.created',
        aggregateType: 'ShoppingCart',
        aggregateId: cart.id,
        payload: { cartId: cart.id, patientId },
      });
    }
    return cart;
  }

  async addToCart(dto: AddToCartDto) {
    const cart = await this.getOrCreateCart(dto.tenantId, dto.patientId);

    const existingItem = await this.repository.findCartItem(cart.id, dto.productId);
    if (existingItem) {
      const newQuantity = existingItem.requestedQuantity + dto.quantity;
      await this.repository.updateCartItem(existingItem.id, {
        requestedQuantity: newQuantity,
        selectedPharmacyId: dto.selectedPharmacyId ?? null,
      });
    } else {
      await this.repository.addCartItem({
        cartId: cart.id,
        productId: dto.productId,
        requestedQuantity: dto.quantity,
        selectedPharmacyId: dto.selectedPharmacyId ?? null,
      });
    }

    await this.repository.createOutboxEvent({
      tenantId: dto.tenantId,
      eventType: 'marketplace.cart.updated',
      aggregateType: 'ShoppingCart',
      aggregateId: cart.id,
      payload: { cartId: cart.id, productId: dto.productId, quantity: dto.quantity },
    });

    return this.repository.findCartById(cart.id);
  }

  async updateCartItem(cartId: string, itemId: string, dto: UpdateCartItemDto) {
    const cart = await this.repository.findCartById(cartId);
    if (!cart) throw new NotFoundException('Shopping cart not found');

    return this.repository.updateCartItem(itemId, {
      requestedQuantity: dto.quantity,
      selectedPharmacyId: dto.selectedPharmacyId ?? null,
    });
  }

  async removeFromCart(cartId: string, itemId: string) {
    const cart = await this.repository.findCartById(cartId);
    if (!cart) throw new NotFoundException('Shopping cart not found');

    await this.repository.removeCartItem(itemId);
    return { message: 'Item removed from cart' };
  }

  async getCart(cartId: string) {
    const cart = await this.repository.findCartById(cartId);
    if (!cart) throw new NotFoundException('Shopping cart not found');
    return cart;
  }

  // === Intelligent Fulfillment Engine ===

  async calculateFulfillmentOptions(dto: FulfillmentOptionsDto) {
    const cart = await this.repository.findCartById(dto.cartId);
    if (!cart) throw new NotFoundException('Shopping cart not found');
    if (cart.items.length === 0) throw new BadRequestException('Cart is empty');

    const options: Array<{
      strategy: FulfillmentStrategy;
      totalCost: number;
      totalTime: number;
      pharmacyCount: number;
      pharmacyIds: string[];
      itemAllocations: Array<{
        productId: string;
        pharmacyId: string;
        quantity: number;
        price: number;
      }>;
    }> = [];

    // Option A: Single pharmacy fulfillment
    const singlePharmacyOptions = await this.calculateSinglePharmacyFulfillment(
      dto.tenantId,
      cart.items,
      dto.latitude,
      dto.longitude,
    );
    options.push(...singlePharmacyOptions);

    // Option B: Split order across pharmacies
    const splitOption = await this.calculateSplitFulfillment(
      dto.tenantId,
      cart.items,
      dto.latitude,
      dto.longitude,
    );
    if (splitOption) options.push(splitOption);

    return {
      cartId: dto.cartId,
      options,
      recommended: this.selectBestOption(options, OptimizationCriteria.LOWEST_PRICE),
    };
  }

  private async calculateSinglePharmacyFulfillment(
    tenantId: string,
    items: Array<{
      productId: string;
      requestedQuantity: number;
      selectedPharmacyId?: string | null;
    }>,
    latitude?: number,
    longitude?: number,
  ) {
    const options: Array<{
      strategy: FulfillmentStrategy;
      totalCost: number;
      totalTime: number;
      pharmacyCount: number;
      pharmacyIds: string[];
      itemAllocations: Array<{
        productId: string;
        pharmacyId: string;
        quantity: number;
        price: number;
      }>;
    }> = [];

    const firstItem = items[0];
    const candidateProducts = await this.repository.findMarketplaceProductsByProduct(
      tenantId,
      firstItem.productId,
    );

    for (const candidate of candidateProducts) {
      const pharmacyId = candidate.pharmacyId;
      let canFulfillAll = true;
      const allocations: Array<{
        productId: string;
        pharmacyId: string;
        quantity: number;
        price: number;
      }> = [];
      let totalCost = 0;
      let totalTime = 0;

      for (const item of items) {
        const mp = await this.repository.findMarketplaceProductsByProduct(tenantId, item.productId);
        const match = mp.find((p) => p.pharmacyId === pharmacyId);
        if (!match || match.availableQuantity < item.requestedQuantity) {
          canFulfillAll = false;
          break;
        }
        allocations.push({
          productId: item.productId,
          pharmacyId,
          quantity: item.requestedQuantity,
          price: Number(match.sellingPrice),
        });
        totalCost += Number(match.sellingPrice) * item.requestedQuantity;
        totalTime += match.estimatedPreparationTime;
      }

      if (canFulfillAll) {
        const pharmacy = await this.repository.findPharmacyStoreById(pharmacyId);
        const distance =
          latitude && longitude && pharmacy
            ? this.calculateDistance(latitude, longitude, pharmacy.latitude, pharmacy.longitude)
            : 0;
        totalTime += Math.ceil(distance * 5);

        options.push({
          strategy: FulfillmentStrategy.SINGLE_PHARMACY,
          totalCost,
          totalTime,
          pharmacyCount: 1,
          pharmacyIds: [pharmacyId],
          itemAllocations: allocations,
        });
      }
    }

    return options;
  }

  private async calculateSplitFulfillment(
    tenantId: string,
    items: Array<{
      productId: string;
      requestedQuantity: number;
      selectedPharmacyId?: string | null;
    }>,
    latitude?: number,
    longitude?: number,
  ) {
    const allocations: Array<{
      productId: string;
      pharmacyId: string;
      quantity: number;
      price: number;
    }> = [];
    let totalCost = 0;
    let totalTime = 0;
    const pharmacyIds = new Set<string>();

    for (const item of items) {
      const products = await this.repository.findMarketplaceProductsByProduct(
        tenantId,
        item.productId,
      );
      const best = products
        .filter((p) => p.availableQuantity >= item.requestedQuantity)
        .sort((a, b) => Number(a.sellingPrice) - Number(b.sellingPrice))[0];

      if (!best) {
        return null;
      }

      allocations.push({
        productId: item.productId,
        pharmacyId: best.pharmacyId,
        quantity: item.requestedQuantity,
        price: Number(best.sellingPrice),
      });
      totalCost += Number(best.sellingPrice) * item.requestedQuantity;
      totalTime += best.estimatedPreparationTime;
      pharmacyIds.add(best.pharmacyId);
    }

    if (latitude && longitude && pharmacyIds.size > 0) {
      let maxDistance = 0;
      for (const pid of pharmacyIds) {
        const pharmacy = await this.repository.findPharmacyStoreById(pid);
        if (pharmacy) {
          const dist = this.calculateDistance(
            latitude,
            longitude,
            pharmacy.latitude,
            pharmacy.longitude,
          );
          if (dist > maxDistance) maxDistance = dist;
        }
      }
      totalTime += Math.ceil(maxDistance * 5);
    }

    return {
      strategy: FulfillmentStrategy.SPLIT,
      totalCost,
      totalTime,
      pharmacyCount: pharmacyIds.size,
      pharmacyIds: Array.from(pharmacyIds),
      itemAllocations: allocations,
    };
  }

  private selectBestOption(
    options: Array<{
      strategy: FulfillmentStrategy;
      totalCost: number;
      totalTime: number;
      pharmacyCount: number;
      pharmacyIds: string[];
      itemAllocations: Array<{
        productId: string;
        pharmacyId: string;
        quantity: number;
        price: number;
      }>;
    }>,
    criteria: OptimizationCriteria,
  ) {
    if (options.length === 0) return null;

    switch (criteria) {
      case OptimizationCriteria.LOWEST_PRICE:
        return options.reduce((best, opt) => (opt.totalCost < best.totalCost ? opt : best));
      case OptimizationCriteria.FASTEST_DELIVERY:
        return options.reduce((best, opt) => (opt.totalTime < best.totalTime ? opt : best));
      case OptimizationCriteria.HIGHEST_RATING:
        return options.reduce((best, opt) => (opt.totalCost < best.totalCost ? opt : best));
      case OptimizationCriteria.MINIMUM_PHARMACY_COUNT:
        return options.reduce((best, opt) => (opt.pharmacyCount < best.pharmacyCount ? opt : best));
      default:
        return options[0];
    }
  }

  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371;
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  // === Checkout & Order Pipeline ===

  async checkout(dto: CheckoutDto) {
    const cart = await this.repository.findCartById(dto.cartId);
    if (!cart) throw new NotFoundException('Shopping cart not found');
    if (cart.items.length === 0) throw new BadRequestException('Cart is empty');

    const fulfillment = await this.calculateFulfillmentOptions({
      tenantId: dto.tenantId,
      cartId: dto.cartId,
    });

    if (!fulfillment.recommended) {
      throw new BadRequestException('No fulfillment option available for current cart');
    }

    const best = fulfillment.recommended;
    const subtotal = best.itemAllocations.reduce((sum, a) => sum + a.price * a.quantity, 0);
    const deliveryFee = best.pharmacyCount * 5;
    const tax = subtotal * 0.08;
    const discount = 0;
    const total = subtotal + deliveryFee + tax - discount;

    const orderNumber = `MKT-${dto.tenantId.slice(0, 8)}-${Date.now()}`;

    const order = await this.repository.createOrder({
      tenantId: dto.tenantId,
      patientId: dto.patientId,
      orderNumber,
      subtotal,
      deliveryFee,
      discount,
      tax,
      total,
      fulfillmentStrategy: best.strategy,
      cartId: dto.cartId,
    });

    for (const allocation of best.itemAllocations) {
      await this.repository.createOrderItem({
        orderId: order.id,
        productId: allocation.productId,
        pharmacyId: allocation.pharmacyId,
        quantity: allocation.quantity,
        sellingPrice: allocation.price,
      });

      const products = await this.repository.findMarketplaceProductsByProduct(
        dto.tenantId,
        allocation.productId,
      );
      const mp = products.find((p) => p.pharmacyId === allocation.pharmacyId);
      if (mp) {
        await this.repository.updateMarketplaceProduct(mp.id, {
          availableQuantity: Math.max(0, mp.availableQuantity - allocation.quantity),
        });
      }
    }

    await this.repository.updateCartStatus(dto.cartId, CartStatus.CHECKOUT);

    await this.repository.createOutboxEvent({
      tenantId: dto.tenantId,
      eventType: 'marketplace.order.created',
      aggregateType: 'MarketplaceOrder',
      aggregateId: order.id,
      payload: { orderId: order.id, orderNumber, total, strategy: best.strategy },
    });

    await this.repository.createOutboxEvent({
      tenantId: dto.tenantId,
      eventType: 'marketplace.inventory.reserved',
      aggregateType: 'MarketplaceOrder',
      aggregateId: order.id,
      payload: { orderId: order.id, items: best.itemAllocations },
    });

    return this.repository.findOrderById(order.id);
  }

  async confirmOrder(orderId: string, tenantId: string) {
    const order = await this.repository.findOrderById(orderId);
    if (!order) throw new NotFoundException('Order not found');
    if (order.tenantId !== tenantId) throw new NotFoundException('Order not found');

    await this.repository.updateOrderStatus(orderId, MarketplaceOrderStatus.CONFIRMED);

    await this.repository.createOutboxEvent({
      tenantId,
      eventType: 'marketplace.order.confirmed',
      aggregateType: 'MarketplaceOrder',
      aggregateId: orderId,
      payload: { orderId, orderNumber: order.orderNumber },
    });

    return this.repository.findOrderById(orderId);
  }

  async recordPayment(dto: RecordPaymentDto) {
    const order = await this.repository.findOrderById(dto.orderId);
    if (!order) throw new NotFoundException('Order not found');
    if (order.tenantId !== dto.tenantId) throw new NotFoundException('Order not found');

    await this.repository.updateOrderStatus(dto.orderId, MarketplaceOrderStatus.PAID);

    await this.repository.createOutboxEvent({
      tenantId: dto.tenantId,
      eventType: 'marketplace.payment.completed',
      aggregateType: 'MarketplaceOrder',
      aggregateId: dto.orderId,
      payload: { orderId: dto.orderId, amount: dto.amount, method: dto.method },
    });

    return this.repository.findOrderById(dto.orderId);
  }

  // === Order Management ===

  async findOrderById(id: string) {
    const order = await this.repository.findOrderById(id);
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  async findOrdersByPatient(tenantId: string, patientId: string, skip?: number, take?: number) {
    return this.repository.findOrdersByPatient(tenantId, patientId, skip, take);
  }

  async cancelOrder(orderId: string, tenantId: string) {
    const order = await this.repository.findOrderById(orderId);
    if (!order) throw new NotFoundException('Order not found');
    if (order.tenantId !== tenantId) throw new NotFoundException('Order not found');

    await this.repository.updateOrderStatus(orderId, MarketplaceOrderStatus.CANCELLED);

    await this.repository.createOutboxEvent({
      tenantId,
      eventType: 'marketplace.order.cancelled',
      aggregateType: 'MarketplaceOrder',
      aggregateId: orderId,
      payload: { orderId, orderNumber: order.orderNumber },
    });

    return this.repository.findOrderById(orderId);
  }

  // === Delivery Management ===

  async assignDelivery(dto: AssignDeliveryDto) {
    const order = await this.repository.findOrderById(dto.orderId);
    if (!order) throw new NotFoundException('Order not found');

    const assignment = await this.repository.createDeliveryAssignment({
      orderId: dto.orderId,
      deliveryPartner: dto.deliveryPartner,
      trackingNumber: dto.trackingNumber ?? null,
      estimatedArrival: dto.estimatedArrival ? new Date(dto.estimatedArrival) : null,
    });

    await this.repository.updateOrderStatus(dto.orderId, MarketplaceOrderStatus.FULFILLED);

    await this.repository.createOutboxEvent({
      tenantId: order.tenantId,
      eventType: 'marketplace.delivery.assigned',
      aggregateType: 'DeliveryAssignment',
      aggregateId: assignment.id,
      payload: {
        orderId: dto.orderId,
        deliveryPartner: dto.deliveryPartner,
        trackingNumber: dto.trackingNumber,
      },
    });

    return assignment;
  }

  async updateDeliveryStatus(assignmentId: string, dto: UpdateDeliveryStatusDto) {
    return this.repository.updateDeliveryStatus(assignmentId, {
      status: dto.status as DeliveryStatus,
      trackingNumber: dto.trackingNumber ?? undefined,
      estimatedArrival: dto.estimatedArrival ? new Date(dto.estimatedArrival) : undefined,
    });
  }

  async findDeliveryAssignment(orderId: string) {
    const assignment = await this.repository.findDeliveryAssignmentByOrder(orderId);
    if (!assignment) throw new NotFoundException('Delivery assignment not found');
    return assignment;
  }

  // === Recommendations ===

  async findNearbyPharmacies(dto: NearbyPharmaciesDto) {
    return this.repository.findNearbyPharmacyStores(
      dto.tenantId,
      dto.latitude,
      dto.longitude,
      dto.radiusKm ?? 10,
      dto.supportsDelivery,
      dto.supportsPickup,
    );
  }

  async comparePrices(dto: PriceComparisonDto) {
    const products = await this.repository.findMarketplaceProductsByProduct(
      dto.tenantId,
      dto.productId,
    );
    return products.map((mp) => ({
      productId: mp.productId,
      pharmacyId: mp.pharmacyId,
      pharmacyName: mp.pharmacy?.name,
      sellingPrice: Number(mp.sellingPrice),
      availableQuantity: mp.availableQuantity,
      estimatedPreparationTime: mp.estimatedPreparationTime,
      distanceKm:
        dto.latitude && dto.longitude && mp.pharmacy
          ? this.calculateDistance(
              dto.latitude,
              dto.longitude,
              mp.pharmacy.latitude,
              mp.pharmacy.longitude,
            )
          : null,
    }));
  }

  async findMedicineAlternatives(dto: MedicineAlternativesDto) {
    const products = await this.repository.findMarketplaceProductsByProduct(
      dto.tenantId,
      dto.productId,
    );
    if (products.length === 0) throw new NotFoundException('Product not found');

    const genericName = products[0].product?.genericName;
    if (!genericName) return [];

    const alternatives = await this.repository.searchMarketplaceProducts({
      tenantId: dto.tenantId,
      genericName,
      limit: 20,
      offset: 0,
    });

    return alternatives.data
      .filter((mp) => mp.productId !== dto.productId)
      .map((mp) => ({
        productId: mp.productId,
        pharmacyId: mp.pharmacyId,
        pharmacyName: mp.pharmacy?.name,
        sellingPrice: Number(mp.sellingPrice),
        availableQuantity: mp.availableQuantity,
        estimatedPreparationTime: mp.estimatedPreparationTime,
        brand: mp.product?.brand,
        distanceKm:
          dto.latitude && dto.longitude && mp.pharmacy
            ? this.calculateDistance(
                dto.latitude,
                dto.longitude,
                mp.pharmacy.latitude,
                mp.pharmacy.longitude,
              )
            : null,
      }));
  }
}
