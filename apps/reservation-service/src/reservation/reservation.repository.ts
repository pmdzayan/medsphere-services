import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ReservationType } from './enums/reservation-type.enum';
import { ReservationStatus } from './enums/reservation-status.enum';

@Injectable()
export class ReservationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: {
    userId: string;
    providerId: string;
    reservationType: ReservationType;
    scheduledAt: Date;
    notes?: string;
  }) {
    return this.prisma.client.reservation.create({
      data: {
        userId: data.userId,
        providerId: data.providerId,
        reservationType: data.reservationType,
        scheduledAt: data.scheduledAt,
        notes: data.notes,
      },
    });
  }

  async findById(id: string) {
    return this.prisma.client.reservation.findUnique({
      where: { id },
    });
  }

  async findByUser(userId: string) {
    return this.prisma.client.reservation.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findByProvider(providerId: string) {
    return this.prisma.client.reservation.findMany({
      where: { providerId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async update(
    id: string,
    data: {
      status?: ReservationStatus;
      scheduledAt?: Date;
      notes?: string;
    },
  ) {
    return this.prisma.client.reservation.update({
      where: { id },
      data,
    });
  }

  async softDelete(id: string) {
    return this.prisma.client.reservation.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
