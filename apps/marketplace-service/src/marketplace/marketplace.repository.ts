import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CartStatus,
  MarketplaceOrderStatus,
  DeliveryStatus,
  ProductVisibility,
  FulfillmentStrategy,
} from './enums';

@Injectable()
export class MarketplaceRepository {
  constructor(private readonly prisma: PrismaService) {}

  // === PharmacyStore ===

  async createPharmacyStore(data: {
    tenantId: string;
    name: string;
    description?: string | null;
    address: string;
    latitude: number;
    longitude: number;
    operatingHours?: Record<string, unknown>;
    deliveryRadiusKm: number;
    supportsPickup: boolean;
    supportsDelivery: boolean;
  }) {
    return this.prisma.client.pharmacyStore.create({
      data: { ...data, operatingHours: data.operatingHours as never },
    });
  }

  async findPharmacyStoreById(id: string) {
    return this.prisma.client.pharmacyStore.findUnique({
      where: { id },
      include: { marketplaceProducts: true, orderItems: true, cartItems: true },
    });
  }

  async findPharmacyStoresByTenant(tenantId: string, skip = 0, take = 50) {
    const [data, total] = await Promise.all([
      this.prisma.client.pharmacyStore.findMany({
        where: { tenantId, isActive: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.client.pharmacyStore.count({ where: { tenantId, isActive: true } }),
    ]);
    return { data, total, limit: take, offset: skip };
  }

  async findNearbyPharmacyStores(
    tenantId: string,
    latitude: number,
    longitude: number,
    radiusKm: number,
    supportsDelivery?: boolean,
    supportsPickup?: boolean,
  ) {
    const where: Record<string, unknown> = {
      tenantId,
      isActive: true,
    };
    if (supportsDelivery !== undefined) where.supportsDelivery = supportsDelivery;
    if (supportsPickup !== undefined) where.supportsPickup = supportsPickup;

    const stores = await this.prisma.client.pharmacyStore.findMany({ where });
    return stores.filter((store) => {
      const distance = this.calculateDistance(latitude, longitude, store.latitude, store.longitude);
      return distance <= radiusKm;
    });
  }

  async updatePharmacyStore(
    id: string,
    data: Partial<{
      name: string;
      description: string | null;
      address: string;
      latitude: number;
      longitude: number;
      operatingHours: Record<string, unknown>;
      deliveryRadiusKm: number;
      supportsPickup: boolean;
      supportsDelivery: boolean;
      isActive: boolean;
    }>,
  ) {
    return this.prisma.client.pharmacyStore.update({
      where: { id },
      data: { ...data, operatingHours: data.operatingHours as never },
    });
  }

  // === MarketplaceProduct ===

  async createMarketplaceProduct(data: {
    tenantId: string;
    pharmacyId: string;
    productId: string;
    sellingPrice: number;
    availableQuantity: number;
    estimatedPreparationTime: number;
    visibility: ProductVisibility;
  }) {
    return this.prisma.client.marketplaceProduct.create({ data });
  }

  async findMarketplaceProductById(id: string) {
    return this.prisma.client.marketplaceProduct.findUnique({
      where: { id },
      include: { product: true, pharmacy: true },
    });
  }

  async findMarketplaceProductsByProduct(tenantId: string, productId: string) {
    return this.prisma.client.marketplaceProduct.findMany({
      where: { tenantId, productId, visibility: ProductVisibility.PUBLIC },
      include: { product: true, pharmacy: true },
    });
  }

  async findMarketplaceProductsByPharmacy(tenantId: string, pharmacyId: string) {
    return this.prisma.client.marketplaceProduct.findMany({
      where: { tenantId, pharmacyId },
      include: { product: true },
    });
  }

  async searchMarketplaceProducts(params: {
    tenantId: string;
    query?: string;
    brand?: string;
    genericName?: string;
    category?: string;
    sku?: string;
    barcode?: string;
    pharmacyId?: string;
    minPrice?: number;
    maxPrice?: number;
    limit: number;
    offset: number;
  }) {
    const where: Record<string, unknown> = {
      tenantId: params.tenantId,
      visibility: ProductVisibility.PUBLIC,
    };
    if (params.pharmacyId) where.pharmacyId = params.pharmacyId;
    if (params.minPrice !== undefined) where.sellingPrice = { gte: params.minPrice };
    if (params.maxPrice !== undefined) {
      where.sellingPrice = {
        ...((where.sellingPrice as Record<string, unknown>) || {}),
        lte: params.maxPrice,
      };
    }

    const productWhere: Record<string, unknown> = {};
    if (params.query) {
      productWhere.OR = [
        { name: { contains: params.query, mode: 'insensitive' } },
        { brand: { contains: params.query, mode: 'insensitive' } },
        { genericName: { contains: params.query, mode: 'insensitive' } },
        { barcode: { equals: params.query } },
      ];
    }
    if (params.brand) productWhere.brand = { contains: params.brand, mode: 'insensitive' };
    if (params.genericName)
      productWhere.genericName = { contains: params.genericName, mode: 'insensitive' };
    if (params.category) productWhere.category = params.category;
    if (params.sku) productWhere.name = { contains: params.sku, mode: 'insensitive' };
    if (params.barcode) productWhere.barcode = params.barcode;

    const [data, total] = await Promise.all([
      this.prisma.client.marketplaceProduct.findMany({
        where: { ...where, product: productWhere },
        include: { product: true, pharmacy: true },
        orderBy: { createdAt: 'desc' },
        take: params.limit,
        skip: params.offset,
      }),
      this.prisma.client.marketplaceProduct.count({ where: { ...where, product: productWhere } }),
    ]);
    return { data, total, limit: params.limit, offset: params.offset };
  }

  async updateMarketplaceProduct(
    id: string,
    data: Partial<{
      sellingPrice: number;
      availableQuantity: number;
      estimatedPreparationTime: number;
      visibility: ProductVisibility;
    }>,
  ) {
    return this.prisma.client.marketplaceProduct.update({ where: { id }, data });
  }

  // === ShoppingCart ===

  async createCart(data: { tenantId: string; patientId: string }) {
    return this.prisma.client.shoppingCart.create({ data });
  }

  async findCartById(id: string) {
    return this.prisma.client.shoppingCart.findUnique({
      where: { id },
      include: { items: { include: { product: true, selectedPharmacy: true } } },
    });
  }

  async findActiveCartByPatient(tenantId: string, patientId: string) {
    return this.prisma.client.shoppingCart.findFirst({
      where: { tenantId, patientId, status: CartStatus.ACTIVE },
      include: { items: { include: { product: true, selectedPharmacy: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateCartStatus(id: string, status: CartStatus) {
    return this.prisma.client.shoppingCart.update({ where: { id }, data: { status } });
  }

  // === ShoppingCartItem ===

  async addCartItem(data: {
    cartId: string;
    productId: string;
    requestedQuantity: number;
    selectedPharmacyId?: string | null;
  }) {
    return this.prisma.client.shoppingCartItem.create({ data });
  }

  async findCartItem(cartId: string, productId: string) {
    return this.prisma.client.shoppingCartItem.findFirst({
      where: { cartId, productId },
    });
  }

  async updateCartItem(
    id: string,
    data: Partial<{
      requestedQuantity: number;
      selectedPharmacyId: string | null;
      allocatedQuantity: number;
    }>,
  ) {
    return this.prisma.client.shoppingCartItem.update({ where: { id }, data });
  }

  async removeCartItem(id: string) {
    return this.prisma.client.shoppingCartItem.delete({ where: { id } });
  }

  // === MarketplaceOrder ===

  async createOrder(data: {
    tenantId: string;
    patientId: string;
    orderNumber: string;
    subtotal: number;
    deliveryFee: number;
    discount: number;
    tax: number;
    total: number;
    fulfillmentStrategy: string;
    cartId?: string | null;
  }) {
    return this.prisma.client.marketplaceOrder.create({
      data: { ...data, fulfillmentStrategy: data.fulfillmentStrategy as FulfillmentStrategy },
    });
  }

  async findOrderById(id: string) {
    return this.prisma.client.marketplaceOrder.findUnique({
      where: { id },
      include: {
        items: { include: { product: true, pharmacy: true } },
        deliveryAssignment: true,
        cart: { include: { items: true } },
      },
    });
  }

  async findOrdersByPatient(tenantId: string, patientId: string, skip = 0, take = 50) {
    const [data, total] = await Promise.all([
      this.prisma.client.marketplaceOrder.findMany({
        where: { tenantId, patientId },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: { items: true, deliveryAssignment: true },
      }),
      this.prisma.client.marketplaceOrder.count({ where: { tenantId, patientId } }),
    ]);
    return { data, total, limit: take, offset: skip };
  }

  async updateOrderStatus(id: string, status: MarketplaceOrderStatus) {
    return this.prisma.client.marketplaceOrder.update({
      where: { id },
      data: { status },
    });
  }

  // === MarketplaceOrderItem ===

  async createOrderItem(data: {
    orderId: string;
    productId: string;
    pharmacyId: string;
    quantity: number;
    reservedBatchId?: string | null;
    sellingPrice: number;
  }) {
    return this.prisma.client.marketplaceOrderItem.create({ data });
  }

  // === DeliveryAssignment ===

  async createDeliveryAssignment(data: {
    orderId: string;
    deliveryPartner: string;
    trackingNumber?: string | null;
    estimatedArrival?: Date | null;
  }) {
    return this.prisma.client.deliveryAssignment.create({ data });
  }

  async findDeliveryAssignmentByOrder(orderId: string) {
    return this.prisma.client.deliveryAssignment.findUnique({
      where: { orderId },
    });
  }

  async updateDeliveryStatus(
    id: string,
    data: Partial<{
      status: DeliveryStatus;
      trackingNumber: string | null;
      estimatedArrival: Date | null;
    }>,
  ) {
    return this.prisma.client.deliveryAssignment.update({ where: { id }, data });
  }

  // === OutboxEvent (for marketplace lifecycle events) ===

  async createOutboxEvent(data: {
    tenantId: string;
    eventType: string;
    aggregateType: string;
    aggregateId: string;
    payload: Record<string, unknown>;
    correlationId?: string | null;
  }) {
    return this.prisma.client.outboxEvent.create({
      data: {
        tenant: { connect: { id: data.tenantId } },
        eventType: data.eventType,
        aggregateType: data.aggregateType,
        aggregateId: data.aggregateId,
        payload: data.payload as never,
        correlationId: data.correlationId,
      },
    });
  }

  // === Utility ===

  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371;
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) *
        Math.cos(this.toRad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRad(deg: number): number {
    return (deg * Math.PI) / 180;
  }
}
