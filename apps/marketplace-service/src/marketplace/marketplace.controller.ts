import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { MarketplaceService } from './marketplace.service';
import { AuditAction } from './audit-action.decorator';
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

@ApiTags('marketplace')
@Controller('api/v1/marketplace')
export class MarketplaceController {
  constructor(private readonly marketplaceService: MarketplaceService) {}

  // === Pharmacy Store Endpoints ===

  @Post('pharmacies')
  @ApiOperation({ summary: 'Create a new pharmacy store' })
  @ApiResponse({ status: 201, description: 'Pharmacy store created' })
  @AuditAction({ action: 'create', resource: 'pharmacy_store', captureBody: true })
  createPharmacyStore(@Body() dto: CreatePharmacyStoreDto) {
    return this.marketplaceService.createPharmacyStore(dto);
  }

  @Get('pharmacies/:id')
  @ApiOperation({ summary: 'Get pharmacy store by ID' })
  @ApiResponse({ status: 200, description: 'Pharmacy store found' })
  findPharmacyStoreById(@Param('id') id: string) {
    return this.marketplaceService.findPharmacyStoreById(id);
  }

  @Get('pharmacies')
  @ApiOperation({ summary: 'List pharmacy stores by tenant' })
  @ApiResponse({ status: 200, description: 'Pharmacy stores found' })
  findPharmacyStoresByTenant(
    @Query('tenantId') tenantId: string,
    @Query('skip', new DefaultValuePipe(0), ParseIntPipe) skip: number,
    @Query('take', new DefaultValuePipe(50), ParseIntPipe) take: number,
  ) {
    return this.marketplaceService.findPharmacyStoresByTenant(tenantId, skip, take);
  }

  @Patch('pharmacies/:id')
  @ApiOperation({ summary: 'Update pharmacy store' })
  @ApiResponse({ status: 200, description: 'Pharmacy store updated' })
  @AuditAction({ action: 'update', resource: 'pharmacy_store' })
  updatePharmacyStore(@Param('id') id: string, @Body() dto: UpdatePharmacyStoreDto) {
    return this.marketplaceService.updatePharmacyStore(id, dto);
  }

  // === Marketplace Product Endpoints ===

  @Post('products')
  @ApiOperation({ summary: 'List a product on the marketplace' })
  @ApiResponse({ status: 201, description: 'Marketplace product created' })
  @AuditAction({ action: 'create', resource: 'marketplace_product', captureBody: true })
  createMarketplaceProduct(@Body() dto: CreateMarketplaceProductDto) {
    return this.marketplaceService.createMarketplaceProduct(dto);
  }

  @Get('products/:id')
  @ApiOperation({ summary: 'Get marketplace product by ID' })
  @ApiResponse({ status: 200, description: 'Marketplace product found' })
  findMarketplaceProductById(@Param('id') id: string) {
    return this.marketplaceService.findMarketplaceProductById(id);
  }

  @Patch('products/:id')
  @ApiOperation({ summary: 'Update marketplace product' })
  @ApiResponse({ status: 200, description: 'Marketplace product updated' })
  @AuditAction({ action: 'update', resource: 'marketplace_product' })
  updateMarketplaceProduct(@Param('id') id: string, @Body() dto: UpdateMarketplaceProductDto) {
    return this.marketplaceService.updateMarketplaceProduct(id, dto);
  }

  // === Search Endpoints ===

  @Get('search')
  @ApiOperation({ summary: 'Universal medicine search across all pharmacies' })
  @ApiResponse({ status: 200, description: 'Search results' })
  searchProducts(
    @Query('tenantId') tenantId: string,
    @Query('query') query: string,
    @Query('brand') brand: string,
    @Query('genericName') genericName: string,
    @Query('category') category: string,
    @Query('sku') sku: string,
    @Query('barcode') barcode: string,
    @Query('pharmacyId') pharmacyId: string,
    @Query('minPrice') minPrice: number,
    @Query('maxPrice') maxPrice: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
  ) {
    const dto: SearchProductsDto = {
      tenantId,
      query,
      brand,
      genericName,
      category,
      sku,
      barcode,
      pharmacyId,
      minPrice,
      maxPrice,
      limit,
      offset,
    };
    return this.marketplaceService.searchProducts(dto);
  }

  // === Smart Cart Endpoints ===

  @Post('cart')
  @ApiOperation({ summary: 'Get or create active cart for patient' })
  @ApiResponse({ status: 200, description: 'Cart found or created' })
  getOrCreateCart(@Query('tenantId') tenantId: string, @Query('patientId') patientId: string) {
    return this.marketplaceService.getOrCreateCart(tenantId, patientId);
  }

  @Post('cart/items')
  @ApiOperation({ summary: 'Add item to cart' })
  @ApiResponse({ status: 201, description: 'Item added to cart' })
  @AuditAction({ action: 'create', resource: 'cart_item', captureBody: true })
  addToCart(@Body() dto: AddToCartDto) {
    return this.marketplaceService.addToCart(dto);
  }

  @Patch('cart/:cartId/items/:itemId')
  @ApiOperation({ summary: 'Update cart item' })
  @ApiResponse({ status: 200, description: 'Cart item updated' })
  @AuditAction({ action: 'update', resource: 'cart_item' })
  updateCartItem(
    @Param('cartId') cartId: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateCartItemDto,
  ) {
    return this.marketplaceService.updateCartItem(cartId, itemId, dto);
  }

  @Delete('cart/:cartId/items/:itemId')
  @ApiOperation({ summary: 'Remove item from cart' })
  @ApiResponse({ status: 200, description: 'Item removed from cart' })
  @AuditAction({ action: 'delete', resource: 'cart_item' })
  removeFromCart(@Param('cartId') cartId: string, @Param('itemId') itemId: string) {
    return this.marketplaceService.removeFromCart(cartId, itemId);
  }

  @Get('cart/:cartId')
  @ApiOperation({ summary: 'Get cart by ID' })
  @ApiResponse({ status: 200, description: 'Cart found' })
  getCart(@Param('cartId') cartId: string) {
    return this.marketplaceService.getCart(cartId);
  }

  // === Fulfillment Endpoints ===

  @Post('fulfillment')
  @ApiOperation({ summary: 'Calculate fulfillment options for cart' })
  @ApiResponse({ status: 200, description: 'Fulfillment options calculated' })
  calculateFulfillmentOptions(@Body() dto: FulfillmentOptionsDto) {
    return this.marketplaceService.calculateFulfillmentOptions(dto);
  }

  // === Checkout Endpoints ===

  @Post('checkout')
  @ApiOperation({ summary: 'Checkout cart and create order' })
  @ApiResponse({ status: 201, description: 'Order created' })
  @AuditAction({ action: 'create', resource: 'marketplace_order', captureBody: true })
  checkout(@Body() dto: CheckoutDto) {
    return this.marketplaceService.checkout(dto);
  }

  @Patch('orders/:orderId/confirm')
  @ApiOperation({ summary: 'Confirm order' })
  @ApiResponse({ status: 200, description: 'Order confirmed' })
  @AuditAction({ action: 'update', resource: 'marketplace_order' })
  confirmOrder(@Param('orderId') orderId: string, @Query('tenantId') tenantId: string) {
    return this.marketplaceService.confirmOrder(orderId, tenantId);
  }

  @Post('orders/payment')
  @ApiOperation({ summary: 'Record payment for order' })
  @ApiResponse({ status: 200, description: 'Payment recorded' })
  @AuditAction({ action: 'create', resource: 'payment', captureBody: true })
  recordPayment(@Body() dto: RecordPaymentDto) {
    return this.marketplaceService.recordPayment(dto);
  }

  // === Order Endpoints ===

  @Get('orders/:id')
  @ApiOperation({ summary: 'Get order by ID' })
  @ApiResponse({ status: 200, description: 'Order found' })
  findOrderById(@Param('id') id: string) {
    return this.marketplaceService.findOrderById(id);
  }

  @Get('orders')
  @ApiOperation({ summary: 'List orders by patient' })
  @ApiResponse({ status: 200, description: 'Orders found' })
  findOrdersByPatient(
    @Query('tenantId') tenantId: string,
    @Query('patientId') patientId: string,
    @Query('skip', new DefaultValuePipe(0), ParseIntPipe) skip: number,
    @Query('take', new DefaultValuePipe(50), ParseIntPipe) take: number,
  ) {
    return this.marketplaceService.findOrdersByPatient(tenantId, patientId, skip, take);
  }

  @Patch('orders/:orderId/cancel')
  @ApiOperation({ summary: 'Cancel order' })
  @ApiResponse({ status: 200, description: 'Order cancelled' })
  @AuditAction({ action: 'update', resource: 'marketplace_order' })
  cancelOrder(@Param('orderId') orderId: string, @Query('tenantId') tenantId: string) {
    return this.marketplaceService.cancelOrder(orderId, tenantId);
  }

  // === Delivery Endpoints ===

  @Post('delivery')
  @ApiOperation({ summary: 'Assign delivery for order' })
  @ApiResponse({ status: 201, description: 'Delivery assigned' })
  @AuditAction({ action: 'create', resource: 'delivery_assignment', captureBody: true })
  assignDelivery(@Body() dto: AssignDeliveryDto) {
    return this.marketplaceService.assignDelivery(dto);
  }

  @Patch('delivery/:assignmentId/status')
  @ApiOperation({ summary: 'Update delivery status' })
  @ApiResponse({ status: 200, description: 'Delivery status updated' })
  @AuditAction({ action: 'update', resource: 'delivery_assignment' })
  updateDeliveryStatus(
    @Param('assignmentId') assignmentId: string,
    @Body() dto: UpdateDeliveryStatusDto,
  ) {
    return this.marketplaceService.updateDeliveryStatus(assignmentId, dto);
  }

  @Get('delivery/:orderId')
  @ApiOperation({ summary: 'Get delivery assignment by order ID' })
  @ApiResponse({ status: 200, description: 'Delivery assignment found' })
  findDeliveryAssignment(@Param('orderId') orderId: string) {
    return this.marketplaceService.findDeliveryAssignment(orderId);
  }

  // === Recommendation Endpoints ===

  @Get('nearby')
  @ApiOperation({ summary: 'Find nearby pharmacies' })
  @ApiResponse({ status: 200, description: 'Nearby pharmacies found' })
  findNearbyPharmacies(
    @Query('tenantId') tenantId: string,
    @Query('latitude') latitude: number,
    @Query('longitude') longitude: number,
    @Query('radiusKm') radiusKm: number,
    @Query('supportsDelivery') supportsDelivery: boolean,
    @Query('supportsPickup') supportsPickup: boolean,
  ) {
    const dto: NearbyPharmaciesDto = {
      tenantId,
      latitude,
      longitude,
      radiusKm,
      supportsDelivery,
      supportsPickup,
    };
    return this.marketplaceService.findNearbyPharmacies(dto);
  }

  @Get('compare/:productId')
  @ApiOperation({ summary: 'Compare prices across pharmacies' })
  @ApiResponse({ status: 200, description: 'Price comparison results' })
  comparePrices(
    @Query('tenantId') tenantId: string,
    @Param('productId') productId: string,
    @Query('latitude') latitude: number,
    @Query('longitude') longitude: number,
  ) {
    const dto: PriceComparisonDto = { tenantId, productId, latitude, longitude };
    return this.marketplaceService.comparePrices(dto);
  }

  @Get('alternatives/:productId')
  @ApiOperation({ summary: 'Find medicine alternatives (generic substitutions)' })
  @ApiResponse({ status: 200, description: 'Medicine alternatives found' })
  findMedicineAlternatives(
    @Query('tenantId') tenantId: string,
    @Param('productId') productId: string,
    @Query('latitude') latitude: number,
    @Query('longitude') longitude: number,
  ) {
    const dto: MedicineAlternativesDto = { tenantId, productId, latitude, longitude };
    return this.marketplaceService.findMedicineAlternatives(dto);
  }
}
