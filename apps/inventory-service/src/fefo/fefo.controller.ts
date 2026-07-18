import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { FefoService, FefoPreviewResult, FefoAllocationResult } from './fefo.service';
import { FefoAllocationDto } from './dto/fefo-allocation.dto';
import { FefoPreviewQueryDto } from './dto/fefo-preview-query.dto';

@Controller('fefo')
export class FefoController {
  constructor(private readonly service: FefoService) {}

  /**
   * Preview FEFO allocation without making any changes.
   * If quantity is omitted, returns all available batches.
   */
  @Get('preview')
  async preview(@Query() query: FefoPreviewQueryDto): Promise<FefoPreviewResult> {
    return this.service.preview(query.providerId, query.productId, query.quantity);
  }

  /**
   * Execute a FEFO allocation with automatic stock deduction.
   * Selects batches using FEFO, deducts quantities, creates stock movements,
   * and records inventory history — all within a single transaction.
   */
  @Post('allocate')
  async allocate(@Body() dto: FefoAllocationDto): Promise<FefoAllocationResult> {
    return this.service.allocate(dto);
  }

  /**
   * Get batch allocation history (stock movements).
   */
  @Get('history')
  async getAllocationHistory(
    @Query('providerId') providerId: string,
    @Query('productId') productId?: string,
    @Query('batchId') batchId?: string,
    @Query('type') type?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.service.getAllocationHistory({
      providerId,
      productId,
      batchId,
      type,
      startDate,
      endDate,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  /**
   * Legacy endpoint: FEFO pick (maintained for backward compatibility).
   */
  @Post('pick')
  async pick(@Body() dto: FefoAllocationDto): Promise<FefoAllocationResult> {
    return this.service.allocate(dto);
  }
}
