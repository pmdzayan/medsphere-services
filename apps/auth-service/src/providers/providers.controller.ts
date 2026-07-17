import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ProvidersService } from './providers.service';
import { CreateProviderDto } from './dto/create-provider.dto';
import { UpdateProviderDto } from './dto/update-provider.dto';
import { ProviderResponseDto } from './dto/provider-response.dto';

@Controller('providers')
export class ProvidersController {
  constructor(private readonly service: ProvidersService) {}

  @Post()
  async create(@Body() dto: CreateProviderDto): Promise<ProviderResponseDto> {
    // TODO: Extract tenantId from authenticated user context
    const tenantId = '00000000-0000-0000-0000-000000000000';
    return this.service.create(tenantId, dto);
  }

  @Get(':id')
  async findById(@Param('id') id: string): Promise<ProviderResponseDto> {
    return this.service.findById(id);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateProviderDto,
  ): Promise<ProviderResponseDto> {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string): Promise<void> {
    return this.service.remove(id);
  }
}
