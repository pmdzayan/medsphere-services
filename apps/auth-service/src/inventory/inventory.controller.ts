import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { CreateInventoryDto } from './dto/create-inventory.dto';
import { UpdateInventoryDto } from './dto/update-inventory.dto';
import { InventoryResponseDto } from './dto/inventory-response.dto';

@Controller('inventory')
export class InventoryController {
  constructor(private readonly service: InventoryService) {}

  @Post()
  async create(@Body() dto: CreateInventoryDto): Promise<InventoryResponseDto> {
    return this.service.create(dto);
  }

  @Get()
  async findAll(
    @Query('providerId') providerId: string,
    @Query('category') category?: string,
    @Query('inStock') inStock?: string,
    @Query('nearExpiry') nearExpiry?: string,
    @Query('search') search?: string,
  ): Promise<InventoryResponseDto[]> {
    return this.service.findAll({
      providerId,
      category,
      inStock: inStock !== undefined ? inStock === 'true' : undefined,
      nearExpiry: nearExpiry === 'true',
      search,
    });
  }

  @Get(':id')
  async findById(@Param('id') id: string): Promise<InventoryResponseDto> {
    return this.service.findById(id);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateInventoryDto,
  ): Promise<InventoryResponseDto> {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string): Promise<void> {
    return this.service.remove(id);
  }
}
