import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { StockLedgerService } from './stock-ledger.service';
import { CreateProductDto } from './dto/create-product.dto';
import { CreateLocationDto } from './dto/create-location.dto';
import { CreateStockBatchDto } from './dto/create-stock-batch.dto';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { CreateReservationDto } from './dto/create-reservation.dto';

@Controller('stock-ledger')
export class StockLedgerController {
  constructor(private readonly service: StockLedgerService) {}

  // ---- Product Catalog ----

  @Post('products')
  async createProduct(@Body() dto: CreateProductDto) {
    return this.service.createProduct(dto);
  }

  @Get('products')
  async findProductsByTenant(@Query('tenantId') tenantId: string) {
    return this.service.findProductsByTenant(tenantId);
  }

  @Get('products/:id')
  async findProductById(@Param('id') id: string) {
    return this.service.findProductById(id);
  }

  // ---- Locations ----

  @Post('locations')
  async createLocation(@Body() dto: CreateLocationDto) {
    return this.service.createLocation(dto);
  }

  @Get('locations')
  async findLocationsByTenant(@Query('tenantId') tenantId: string) {
    return this.service.findLocationsByTenant(tenantId);
  }

  @Get('locations/:id')
  async findLocationById(@Param('id') id: string) {
    return this.service.findLocationById(id);
  }

  // ---- Stock Batches ----

  @Post('batches')
  async createStockBatch(@Body() dto: CreateStockBatchDto) {
    return this.service.createStockBatch(dto);
  }

  @Get('batches')
  async findStockBatchesByProduct(
    @Query('tenantId') tenantId: string,
    @Query('productId') productId: string,
  ) {
    return this.service.findStockBatchesByProduct(tenantId, productId);
  }

  @Get('batches/:id')
  async findStockBatchById(@Param('id') id: string) {
    return this.service.findStockBatchById(id);
  }

  @Get('fefo-preview')
  async previewFefoAllocation(
    @Query('tenantId') tenantId: string,
    @Query('productId') productId: string,
    @Query('quantity') quantity?: string,
  ) {
    return this.service.previewFefoAllocation(
      tenantId,
      productId,
      quantity ? parseInt(quantity, 10) : undefined,
    );
  }

  // ---- Stock Ledger Transactions ----

  @Post('transactions')
  async createTransaction(@Body() dto: CreateTransactionDto) {
    return this.service.createTransaction(dto);
  }

  @Get('transactions')
  async findTransactionsByTenant(
    @Query('tenantId') tenantId: string,
    @Query('productId') productId?: string,
    @Query('batchId') batchId?: string,
    @Query('transactionType') transactionType?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.service.findTransactionsByTenant(tenantId, {
      productId,
      batchId,
      transactionType,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  // ---- Stock Reservations ----

  @Post('reservations')
  async createReservation(@Body() dto: CreateReservationDto) {
    return this.service.createReservation(dto);
  }

  @Post('reservations/:id/fulfill')
  async fulfillReservation(@Param('id') id: string) {
    return this.service.fulfillReservation(id);
  }

  @Post('reservations/:id/cancel')
  async cancelReservation(@Param('id') id: string) {
    return this.service.cancelReservation(id);
  }
}
