import { Injectable, NotFoundException } from '@nestjs/common';
import { AuthenticatedIdentity } from '../auth/auth.types';
import { ProviderReservationQueryDto } from './dto/reservation-query.dto';
import {
  ProviderReservationListResponseDto,
  ProviderReservationResponseDto,
} from './dto/reservation-response.dto';
import { ReservationRepository } from './reservation.repository';

@Injectable()
export class ReservationService {
  constructor(private readonly repository: ReservationRepository) {}

  async list(
    identity: AuthenticatedIdentity,
    providerId: string,
    query: ProviderReservationQueryDto,
  ): Promise<ProviderReservationListResponseDto> {
    await this.assertAccess(identity, providerId);
    const result = await this.repository.list(identity.tenantId, providerId, query);
    return {
      data: result.data.map((reservation) => this.mapReservation(reservation)),
      total: result.total,
      limit: query.limit,
      offset: query.offset,
    };
  }

  async get(
    identity: AuthenticatedIdentity,
    providerId: string,
    reservationId: string,
  ): Promise<ProviderReservationResponseDto> {
    await this.assertAccess(identity, providerId);
    const reservation = await this.repository.find(identity.tenantId, providerId, reservationId);
    if (!reservation) throw new NotFoundException('Medicine reservation not found');
    return this.mapReservation(reservation);
  }

  private async assertAccess(identity: AuthenticatedIdentity, providerId: string): Promise<void> {
    if (!(await this.repository.hasProviderAccess(identity, providerId))) {
      throw new NotFoundException('Medicine reservation not found');
    }
  }

  private mapReservation(
    reservation: NonNullable<Awaited<ReturnType<ReservationRepository['find']>>>,
  ): ProviderReservationResponseDto {
    const items = reservation.items.map((item) => ({
      productId: item.productId,
      name: item.product.name,
      genericName: item.product.genericName,
      brand: item.product.brand,
      quantity: item.quantity,
      allocations: item.allocations.map((allocation) => ({
        batchId: allocation.batchId,
        batchNumber: allocation.batch.batchNumber,
        quantity: allocation.quantity,
        status: allocation.status,
      })),
    }));
    return {
      id: reservation.id,
      status: reservation.status,
      version: reservation.version,
      expiresAt: reservation.expiresAt,
      createdAt: reservation.createdAt,
      items,
      totalQuantity: items.reduce((total, item) => total + item.quantity, 0),
    };
  }
}
