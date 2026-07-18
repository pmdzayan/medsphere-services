import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { StockMovementService } from './stock-movement.service';
import { CreateStockMovementDto } from './dto/create-stock-movement.dto';
import {
  StockMovementResponseDto,
  PaginatedStockMovementResponseDto,
} from './dto/stock-movement-response.dto';

@Controller('stock-movements')
export class StockMovementController {
  constructor(private readonly service: StockMovementService) {}

  @Post()
  async create(@Body() dto: CreateStockMovementDto): Promise<StockMovementResponseDto> {
    return this.service.create(dto);
  }

  @Post('stock-in')
  async recordStockIn(@Body() dto: CreateStockMovementDto): Promise<StockMovementResponseDto> {
    return this.service.create(dto);
  }

  @Post('stock-out')
  async recordStockOut(@Body() dto: CreateStockMovementDto): Promise<StockMovementResponseDto> {
    return this.service.create(dto);
  }

  @Post('adjustment')
  async recordAdjustment(@Body() dto: CreateStockMovementDto): Promise<StockMovementResponseDto> {
    return this.service.create(dto);
  }

  @Get()
  async findAll(
    @Query('providerId') providerId: string,
    @Query('inventoryId') inventoryId?: string,
    @Query('batchId') batchId?: string,
    @Query('productId') productId?: string,
    @Query('type') type?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<PaginatedStockMovementResponseDto> {
    return this.service.findAll({
      providerId,
      inventoryId,
      batchId,
      productId,
      type,
      startDate,
      endDate,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Get('product/:productId')
  async findByProduct(
    @Param('productId') productId: string,
    @Query('providerId') providerId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<PaginatedStockMovementResponseDto> {
    return this.service.findAll({
      providerId,
      productId,
      startDate,
      endDate,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Get('batch/:batchId')
  async findByBatch(
    @Param('batchId') batchId: string,
    @Query('providerId') providerId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<PaginatedStockMovementResponseDto> {
    return this.service.findAll({
      providerId,
      batchId,
      startDate,
      endDate,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Get('inventory/:inventoryId')
  async findByInventory(
    @Param('inventoryId') inventoryId: string,
    @Query('providerId') providerId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<PaginatedStockMovementResponseDto> {
    return this.service.findAll({
      providerId,
      inventoryId,
      startDate,
      endDate,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Get(':id')
  async findById(@Param('id') id: string): Promise<StockMovementResponseDto> {
    return this.service.findById(id);
  }
}
