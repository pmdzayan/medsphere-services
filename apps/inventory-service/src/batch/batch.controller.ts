import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { BatchService } from './batch.service';
import { CreateBatchDto } from './dto/create-batch.dto';
import { UpdateBatchDto } from './dto/update-batch.dto';
import { BatchResponseDto } from './dto/batch-response.dto';

@Controller('batches')
export class BatchController {
  constructor(private readonly service: BatchService) {}

  @Post()
  async create(@Body() dto: CreateBatchDto): Promise<BatchResponseDto> {
    return this.service.create(dto);
  }

  @Get()
  async findAll(
    @Query('providerId') providerId: string,
    @Query('productId') productId?: string,
    @Query('status') status?: string,
    @Query('nearExpiry') nearExpiry?: string,
    @Query('expired') expired?: string,
  ): Promise<BatchResponseDto[]> {
    return this.service.findAll({
      providerId,
      productId,
      status,
      nearExpiry: nearExpiry === 'true',
      expired: expired === 'true',
    });
  }

  @Get(':id')
  async findById(@Param('id') id: string): Promise<BatchResponseDto> {
    return this.service.findById(id);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateBatchDto): Promise<BatchResponseDto> {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string): Promise<void> {
    return this.service.remove(id);
  }
}
