import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ReservationService } from './reservation.service';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { UpdateReservationDto } from './dto/update-reservation.dto';
import { ReservationResponseDto } from './dto/reservation-response.dto';

@Controller('reservations')
export class ReservationController {
  constructor(private readonly service: ReservationService) {}

  @Post()
  async create(@Body() dto: CreateReservationDto): Promise<ReservationResponseDto> {
    // TODO: Extract userId from authenticated user context
    const userId = '00000000-0000-0000-0000-000000000000';
    return this.service.create(userId, dto);
  }

  @Get('me')
  async findMyReservations(): Promise<ReservationResponseDto[]> {
    // TODO: Extract userId from authenticated user context
    const userId = '00000000-0000-0000-0000-000000000000';
    return this.service.findByUser(userId);
  }

  @Get(':id')
  async findById(@Param('id') id: string): Promise<ReservationResponseDto> {
    // TODO: Extract userId from authenticated user context
    const userId = '00000000-0000-0000-0000-000000000000';
    return this.service.findById(userId, id);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateReservationDto,
  ): Promise<ReservationResponseDto> {
    // TODO: Extract userId from authenticated user context
    const userId = '00000000-0000-0000-0000-000000000000';
    return this.service.update(userId, id, dto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string): Promise<void> {
    // TODO: Extract userId from authenticated user context
    const userId = '00000000-0000-0000-0000-000000000000';
    return this.service.remove(userId, id);
  }
}
