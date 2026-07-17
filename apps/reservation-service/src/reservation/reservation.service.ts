import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { ReservationRepository } from './reservation.repository';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { UpdateReservationDto } from './dto/update-reservation.dto';
import { ReservationResponseDto } from './dto/reservation-response.dto';
import { ReservationStatus } from './enums/reservation-status.enum';

const VALID_TRANSITIONS: Record<ReservationStatus, ReservationStatus[]> = {
  [ReservationStatus.PENDING]: [
    ReservationStatus.CONFIRMED,
    ReservationStatus.CANCELLED,
    ReservationStatus.EXPIRED,
  ],
  [ReservationStatus.CONFIRMED]: [
    ReservationStatus.READY,
    ReservationStatus.CANCELLED,
    ReservationStatus.EXPIRED,
  ],
  [ReservationStatus.READY]: [ReservationStatus.COMPLETED, ReservationStatus.CANCELLED],
  [ReservationStatus.COMPLETED]: [],
  [ReservationStatus.CANCELLED]: [],
  [ReservationStatus.EXPIRED]: [],
};

@Injectable()
export class ReservationService {
  constructor(private readonly repository: ReservationRepository) {}

  async create(userId: string, dto: CreateReservationDto): Promise<ReservationResponseDto> {
    const scheduledAt = new Date(dto.scheduledAt);
    const now = new Date();

    if (scheduledAt <= now) {
      throw new BadRequestException('Cannot book a reservation in the past');
    }

    const record = await this.repository.create({
      userId,
      providerId: dto.providerId,
      reservationType: dto.reservationType,
      scheduledAt,
      notes: dto.notes,
    });

    return this.toResponseDto(record);
  }

  async findById(userId: string, id: string): Promise<ReservationResponseDto> {
    const record = await this.repository.findById(id);

    if (!record || record.deletedAt) {
      throw new NotFoundException('Reservation not found');
    }

    if (record.userId !== userId) {
      throw new ForbiddenException('You can only access your own reservations');
    }

    return this.toResponseDto(record);
  }

  async findByUser(userId: string): Promise<ReservationResponseDto[]> {
    const records = await this.repository.findByUser(userId);
    return (
      records
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((record: any) => !record.deletedAt)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((record: any) => this.toResponseDto(record))
    );
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateReservationDto,
  ): Promise<ReservationResponseDto> {
    const existing = await this.repository.findById(id);

    if (!existing || existing.deletedAt) {
      throw new NotFoundException('Reservation not found');
    }

    if (existing.userId !== userId) {
      throw new ForbiddenException('You can only update your own reservations');
    }

    const updateData: Record<string, unknown> = {};

    if (dto.scheduledAt !== undefined) {
      const newScheduledAt = new Date(dto.scheduledAt);
      const now = new Date();
      if (newScheduledAt <= now) {
        throw new BadRequestException('Cannot reschedule to a time in the past');
      }
      updateData.scheduledAt = newScheduledAt;
    }

    if (dto.status !== undefined) {
      const currentStatus = existing.status as ReservationStatus;
      const allowedTransitions = VALID_TRANSITIONS[currentStatus];

      if (!allowedTransitions.includes(dto.status)) {
        throw new BadRequestException(
          `Invalid status transition from ${currentStatus} to ${dto.status}`,
        );
      }

      updateData.status = dto.status;
    }

    if (dto.notes !== undefined) {
      updateData.notes = dto.notes;
    }

    const updated = await this.repository.update(id, updateData);
    return this.toResponseDto(updated);
  }

  async remove(userId: string, id: string): Promise<void> {
    const existing = await this.repository.findById(id);

    if (!existing || existing.deletedAt) {
      throw new NotFoundException('Reservation not found');
    }

    if (existing.userId !== userId) {
      throw new ForbiddenException('You can only delete your own reservations');
    }

    await this.repository.softDelete(id);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private toResponseDto(record: any): ReservationResponseDto {
    const dto = new ReservationResponseDto();
    dto.id = record.id;
    dto.userId = record.userId;
    dto.providerId = record.providerId;
    dto.reservationType = record.reservationType;
    dto.status = record.status;
    dto.scheduledAt =
      record.scheduledAt instanceof Date ? record.scheduledAt.toISOString() : record.scheduledAt;
    dto.notes = record.notes ?? undefined;
    dto.createdAt =
      record.createdAt instanceof Date ? record.createdAt.toISOString() : record.createdAt;
    dto.updatedAt =
      record.updatedAt instanceof Date ? record.updatedAt.toISOString() : record.updatedAt;
    return dto;
  }
}
