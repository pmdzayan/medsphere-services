import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AvailabilityService } from '../availability/availability.service';
import { FefoService } from '../fefo/fefo.service';
import { InventoryRepository } from '../inventory/inventory.repository';

export enum ReservationStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  READY = 'READY',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
}

export interface ReservationResult {
  id: string;
  userId: string;
  providerId: string;
  productId: string;
  productName: string;
  quantity: number;
  status: ReservationStatus;
  reservedAt: Date;
  expiresAt: Date;
  pickedUpAt: Date | null;
  cancelledAt: Date | null;
  notes: string | null;
}

export interface PaginatedReservationResult {
  data: ReservationResult[];
  total: number;
  limit: number;
  offset: number;
}

export interface ReservationQueryParams {
  userId?: string;
  providerId?: string;
  productId?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

const RESERVATION_EXPIRY_MINUTES = 60; // Configurable: reservations expire after 60 minutes

@Injectable()
export class ReservationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly availabilityService: AvailabilityService,
    private readonly fefoService: FefoService,
    private readonly inventoryRepository: InventoryRepository,
  ) {}

  /**
   * Create a reservation for a product at a pharmacy.
   * Reduces sellable quantity by reserving stock.
   */
  async createReservation(params: {
    userId: string;
    providerId: string;
    productId: string;
    quantity: number;
    notes?: string;
  }): Promise<ReservationResult> {
    const { userId, providerId, productId, quantity, notes } = params;

    if (quantity <= 0) {
      throw new BadRequestException('Quantity must be greater than 0');
    }

    // Check availability
    const availability = await this.availabilityService.getProductAvailability(
      providerId,
      productId,
    );

    if (availability.sellableQuantity < quantity) {
      throw new BadRequestException(
        `Insufficient sellable stock. Requested ${quantity}, available ${availability.sellableQuantity}`,
      );
    }

    if (availability.status === 'UNAVAILABLE' || availability.status === 'OUT_OF_STOCK') {
      throw new BadRequestException('Product is not available for reservation');
    }

    // Check for duplicate active reservation (same user, same product, same pharmacy)
    const existingActive = await this.prisma.client.reservation.findFirst({
      where: {
        userId,
        providerId,
        status: { in: ['PENDING', 'CONFIRMED', 'READY'] },
        deletedAt: null,
      },
    });

    if (existingActive) {
      throw new BadRequestException(
        'You already have an active reservation for this pharmacy. Please complete or cancel it first.',
      );
    }

    // Execute reservation within transaction
    const result = await this.prisma.client.$transaction(async () => {
      // 1. Find inventory record and update reserved quantity
      const inventoryItems = await this.prisma.client.inventory.findMany({
        where: {
          providerId,
          productId,
          deletedAt: null,
        },
        select: { id: true, quantity: true, reservedQuantity: true },
      });

      if (inventoryItems.length === 0) {
        throw new BadRequestException('No inventory found for this product');
      }

      // Update reserved quantity on the first inventory record
      const inventory = inventoryItems[0];
      const newReserved = inventory.reservedQuantity + quantity;

      if (newReserved > inventory.quantity) {
        throw new BadRequestException(
          `Cannot reserve more than available stock. Available: ${inventory.quantity - inventory.reservedQuantity}`,
        );
      }

      await this.inventoryRepository.update(inventory.id, {
        reservedQuantity: newReserved,
      });

      // 2. Create reservation record
      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + RESERVATION_EXPIRY_MINUTES);

      const reservation = await this.prisma.client.reservation.create({
        data: {
          userId,
          providerId,
          reservationType: 'MEDICINE_PICKUP',
          status: 'PENDING',
          scheduledAt: new Date(),
          notes: JSON.stringify({
            productId,
            quantity,
            expiresAt: expiresAt.toISOString(),
            userNotes: notes ?? null,
          }),
        },
      });

      return reservation;
    });

    return this.toResult(result);
  }

  /**
   * Confirm a reservation (pharmacy action).
   */
  async confirmReservation(reservationId: string): Promise<ReservationResult> {
    const reservation = await this.findReservationOrThrow(reservationId);

    if (reservation.status !== 'PENDING') {
      throw new BadRequestException(`Cannot confirm reservation in status: ${reservation.status}`);
    }

    const updated = await this.prisma.client.reservation.update({
      where: { id: reservationId },
      data: { status: 'CONFIRMED' },
    });

    return this.toResult(updated);
  }

  /**
   * Mark reservation as ready for pickup (pharmacy action).
   */
  async markReadyForPickup(reservationId: string): Promise<ReservationResult> {
    const reservation = await this.findReservationOrThrow(reservationId);

    if (reservation.status !== 'CONFIRMED') {
      throw new BadRequestException(
        `Cannot mark as ready. Reservation is in status: ${reservation.status}`,
      );
    }

    const updated = await this.prisma.client.reservation.update({
      where: { id: reservationId },
      data: { status: 'READY' },
    });

    return this.toResult(updated);
  }

  /**
   * Complete pickup: trigger FEFO allocation, deduct actual stock, release reserved quantity.
   */
  async completePickup(reservationId: string, userId: string): Promise<ReservationResult> {
    const reservation = await this.findReservationOrThrow(reservationId);

    if (reservation.status !== 'READY' && reservation.status !== 'CONFIRMED') {
      throw new BadRequestException(
        `Cannot complete pickup. Reservation is in status: ${reservation.status}`,
      );
    }

    const notes = this.parseNotes(reservation.notes);
    const { productId, quantity } = notes;

    // Execute pickup within transaction
    const result = await this.prisma.client.$transaction(async () => {
      // 1. Trigger FEFO allocation to deduct actual stock
      await this.fefoService.allocate({
        providerId: reservation.providerId,
        productId,
        quantity,
        userId,
        reason: 'RESERVATION_PICKUP',
        notes: `Pickup for reservation ${reservationId}`,
      });

      // 2. Release reserved quantity
      const inventoryItems = await this.prisma.client.inventory.findMany({
        where: {
          providerId: reservation.providerId,
          productId,
          deletedAt: null,
        },
        select: { id: true, reservedQuantity: true },
      });

      if (inventoryItems.length > 0) {
        const inventory = inventoryItems[0];
        const newReserved = Math.max(0, inventory.reservedQuantity - quantity);
        await this.inventoryRepository.update(inventory.id, {
          reservedQuantity: newReserved,
        });
      }

      // 3. Update reservation status
      const updated = await this.prisma.client.reservation.update({
        where: { id: reservationId },
        data: {
          status: 'COMPLETED',
          scheduledAt: new Date(),
        },
      });

      return updated;
    });

    return this.toResult(result);
  }

  /**
   * Cancel a reservation. Restores sellable quantity.
   */
  async cancelReservation(reservationId: string): Promise<ReservationResult> {
    const reservation = await this.findReservationOrThrow(reservationId);

    if (
      reservation.status === 'COMPLETED' ||
      reservation.status === 'CANCELLED' ||
      reservation.status === 'EXPIRED'
    ) {
      throw new BadRequestException(`Cannot cancel reservation in status: ${reservation.status}`);
    }

    const notes = this.parseNotes(reservation.notes);
    const { productId, quantity } = notes;

    // Execute cancellation within transaction
    const result = await this.prisma.client.$transaction(async () => {
      // 1. Restore reserved quantity
      const inventoryItems = await this.prisma.client.inventory.findMany({
        where: {
          providerId: reservation.providerId,
          productId,
          deletedAt: null,
        },
        select: { id: true, reservedQuantity: true },
      });

      if (inventoryItems.length > 0) {
        const inventory = inventoryItems[0];
        const newReserved = Math.max(0, inventory.reservedQuantity - quantity);
        await this.inventoryRepository.update(inventory.id, {
          reservedQuantity: newReserved,
        });
      }

      // 2. Update reservation status
      const updated = await this.prisma.client.reservation.update({
        where: { id: reservationId },
        data: { status: 'CANCELLED' },
      });

      return updated;
    });

    return this.toResult(result);
  }

  /**
   * Auto-expire reservations that have passed their expiry time.
   */
  async autoExpireReservations(): Promise<number> {
    const now = new Date();
    const expiredReservations = await this.prisma.client.reservation.findMany({
      where: {
        status: { in: ['PENDING', 'CONFIRMED'] },
        deletedAt: null,
      },
    });

    let expiredCount = 0;

    for (const reservation of expiredReservations) {
      const notes = this.parseNotes(reservation.notes);
      const expiresAt = new Date(notes.expiresAt ?? reservation.createdAt);

      if (now > expiresAt) {
        try {
          await this.cancelReservation(reservation.id);
          // Override status to EXPIRED
          await this.prisma.client.reservation.update({
            where: { id: reservation.id },
            data: { status: 'EXPIRED' },
          });
          expiredCount++;
        } catch {
          // Skip if cancellation fails
        }
      }
    }

    return expiredCount;
  }

  /**
   * Get reservation details.
   */
  async getReservation(reservationId: string): Promise<ReservationResult> {
    const reservation = await this.findReservationOrThrow(reservationId);
    return this.toResult(reservation);
  }

  /**
   * Get reservations for a user.
   */
  async getUserReservations(
    userId: string,
    params: ReservationQueryParams,
  ): Promise<PaginatedReservationResult> {
    return this.findReservations({ ...params, userId });
  }

  /**
   * Get reservations for a pharmacy.
   */
  async getPharmacyReservations(
    providerId: string,
    params: ReservationQueryParams,
  ): Promise<PaginatedReservationResult> {
    return this.findReservations({ ...params, providerId });
  }

  /**
   * Get reservation history with filters.
   */
  async getReservationHistory(params: ReservationQueryParams): Promise<PaginatedReservationResult> {
    return this.findReservations(params);
  }

  private async findReservations(
    params: ReservationQueryParams,
  ): Promise<PaginatedReservationResult> {
    const limit = params.limit ?? 20;
    const offset = params.offset ?? 0;

    const where: Record<string, unknown> = {
      deletedAt: null,
    };

    if (params.userId) where.userId = params.userId;
    if (params.providerId) where.providerId = params.providerId;
    if (params.status) where.status = params.status;

    // Date range filtering
    if (params.startDate || params.endDate) {
      const createdAtFilter: Record<string, Date> = {};
      if (params.startDate) createdAtFilter.gte = new Date(params.startDate);
      if (params.endDate) createdAtFilter.lte = new Date(params.endDate);
      where.createdAt = createdAtFilter;
    }

    const [reservations, total] = await Promise.all([
      this.prisma.client.reservation.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.client.reservation.count({ where }),
    ]);

    return {
      data: reservations.map((r) => this.toResult(r)),
      total,
      limit,
      offset,
    };
  }

  private async findReservationOrThrow(reservationId: string) {
    const reservation = await this.prisma.client.reservation.findUnique({
      where: { id: reservationId },
    });

    if (!reservation || reservation.deletedAt) {
      throw new NotFoundException('Reservation not found');
    }

    return reservation;
  }

  private parseNotes(notes: string | null): {
    productId: string;
    quantity: number;
    expiresAt?: string;
    userNotes?: string | null;
  } {
    try {
      return JSON.parse(notes ?? '{}');
    } catch {
      return { productId: '', quantity: 0 };
    }
  }

  private toResult(reservation: {
    id: string;
    userId: string;
    providerId: string;
    status: string;
    reservationType: string;
    scheduledAt: Date;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
    deletedAt: Date | null;
  }): ReservationResult {
    const notes = this.parseNotes(reservation.notes);
    const expiresAt = new Date(notes.expiresAt ?? reservation.createdAt);
    expiresAt.setMinutes(expiresAt.getMinutes() + RESERVATION_EXPIRY_MINUTES);

    return {
      id: reservation.id,
      userId: reservation.userId,
      providerId: reservation.providerId,
      productId: notes.productId,
      productName: '',
      quantity: notes.quantity,
      status: reservation.status as ReservationStatus,
      reservedAt: reservation.createdAt,
      expiresAt,
      pickedUpAt: reservation.status === 'COMPLETED' ? reservation.scheduledAt : null,
      cancelledAt:
        reservation.status === 'CANCELLED' || reservation.status === 'EXPIRED'
          ? reservation.updatedAt
          : null,
      notes: notes.userNotes ?? null,
    };
  }
}
