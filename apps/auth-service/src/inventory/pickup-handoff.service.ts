import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SerializableRetryError, withSerializableRetry } from '@medsphere/database';
import { AuditWriter } from '../audit/audit-writer.service';
import type { AuthenticatedIdentity, RequestMetadata } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { assertPersonalAccountContext } from './patient-context';

const PICKUP_PROOF_TTL_MS = 15 * 60 * 1000;
const PICKUP_TOKEN_BYTES = 24;
const PICKUP_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32}$/;
const SERIALIZABLE_ATTEMPTS = 5;

export interface VerifiedPickupAuthority {
  readonly pickupTokenId: string;
  readonly proofVersion: number;
}

@Injectable()
export class PickupHandoffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditWriter,
  ) {}

  async issuePatientProof(
    identity: AuthenticatedIdentity,
    reservationId: string,
    request?: RequestMetadata,
  ) {
    await assertPersonalAccountContext(this.prisma.client, identity);

    return withSerializableRetry(
      this.prisma.client,
      async (transaction) => {
        const reservation = await transaction.medicineReservation.findFirst({
          where: {
            id: reservationId,
            subjectUserId: identity.userId,
          },
          select: {
            id: true,
            tenantId: true,
            providerId: true,
            subjectUserId: true,
            status: true,
            version: true,
            expiresAt: true,
            pickupToken: {
              select: {
                id: true,
                tokenVersion: true,
                consumedAt: true,
              },
            },
          },
        });
        if (!reservation) throw new NotFoundException('Medicine reservation not found');
        if (reservation.status !== 'READY') {
          throw new ConflictException('Pickup proof is available only for a ready reservation');
        }

        const [{ occurredAt }] = await transaction.$queryRaw<Array<{ occurredAt: Date }>>(
          Prisma.sql`SELECT CURRENT_TIMESTAMP AS "occurredAt"`,
        );
        if (!(occurredAt instanceof Date) || Number.isNaN(occurredAt.getTime())) {
          throw new Error('Database timestamp was not returned');
        }
        if (reservation.expiresAt.getTime() <= occurredAt.getTime()) {
          throw new ConflictException('Expired medicine reservation awaits system expiry');
        }
        if (reservation.pickupToken?.consumedAt) {
          throw new ConflictException('Pickup proof has already been consumed');
        }

        const token = randomBytes(PICKUP_TOKEN_BYTES).toString('base64url');
        const tokenHash = digestPickupToken(token);
        const expiresAt = new Date(
          Math.min(reservation.expiresAt.getTime(), occurredAt.getTime() + PICKUP_PROOF_TTL_MS),
        );

        const pickupToken = reservation.pickupToken
          ? await this.rotateToken(transaction, reservation.pickupToken, tokenHash, occurredAt, expiresAt)
          : await transaction.medicinePickupToken.create({
              data: {
                id: randomUUID(),
                tenantId: reservation.tenantId,
                providerId: reservation.providerId,
                reservationId: reservation.id,
                subjectUserId: reservation.subjectUserId,
                tokenHash,
                tokenVersion: 1,
                issuedAt: occurredAt,
                expiresAt,
              },
              select: { tokenVersion: true },
            });

        await this.audit.appendPlatformUser(transaction, {
          platformActorUserId: identity.userId,
          eventType: 'inventory.pickup.proof.issued',
          outcome: 'SUCCEEDED',
          resourceType: 'MedicineReservation',
          resourceId: reservation.id,
          occurredAt,
          metadata: {
            providerId: reservation.providerId,
            reservationVersion: reservation.version,
            proofVersion: pickupToken.tokenVersion,
            expiresAt: expiresAt.toISOString(),
          },
          request,
        });

        return {
          reservationId: reservation.id,
          pickupToken: token,
          expiresAt,
          proofVersion: pickupToken.tokenVersion,
        };
      },
      SERIALIZABLE_ATTEMPTS,
    );
  }

  async verifyForCheckout(
    transaction: Prisma.TransactionClient,
    input: {
      readonly tenantId: string;
      readonly providerId: string;
      readonly reservationId: string;
      readonly subjectUserId: string;
      readonly pickupToken: string;
      readonly occurredAt: Date;
    },
  ): Promise<VerifiedPickupAuthority> {
    if (!PICKUP_TOKEN_PATTERN.test(input.pickupToken)) {
      throw new ConflictException('Pickup authorization is invalid or expired');
    }

    const authority = await transaction.medicinePickupToken.findFirst({
      where: {
        reservationId: input.reservationId,
        tenantId: input.tenantId,
        providerId: input.providerId,
        subjectUserId: input.subjectUserId,
      },
      select: {
        id: true,
        tokenHash: true,
        tokenVersion: true,
        expiresAt: true,
        consumedAt: true,
      },
    });

    if (
      !authority ||
      authority.consumedAt ||
      authority.expiresAt.getTime() <= input.occurredAt.getTime() ||
      !matchesDigest(authority.tokenHash, input.pickupToken)
    ) {
      throw new ConflictException('Pickup authorization is invalid or expired');
    }

    return {
      pickupTokenId: authority.id,
      proofVersion: authority.tokenVersion,
    };
  }

  async recordCompletedHandoff(
    transaction: Prisma.TransactionClient,
    input: {
      readonly actor: {
        readonly tenantId: string;
        readonly userId: string;
        readonly membershipId: string;
      };
      readonly providerId: string;
      readonly reservationId: string;
      readonly subjectUserId: string;
      readonly saleId: string;
      readonly authority: VerifiedPickupAuthority;
      readonly occurredAt: Date;
      readonly request?: RequestMetadata;
    },
  ): Promise<void> {
    const consumed = await transaction.medicinePickupToken.updateMany({
      where: {
        id: input.authority.pickupTokenId,
        reservationId: input.reservationId,
        tenantId: input.actor.tenantId,
        providerId: input.providerId,
        subjectUserId: input.subjectUserId,
        tokenVersion: input.authority.proofVersion,
        consumedAt: null,
        expiresAt: { gt: input.occurredAt },
      },
      data: { consumedAt: input.occurredAt },
    });
    if (consumed.count !== 1) {
      throw new SerializableRetryError('Concurrent pickup authorization consumption detected');
    }

    const handoff = await transaction.medicinePickupHandoff.create({
      data: {
        id: randomUUID(),
        tenantId: input.actor.tenantId,
        providerId: input.providerId,
        reservationId: input.reservationId,
        subjectUserId: input.subjectUserId,
        saleId: input.saleId,
        verifiedByMembershipId: input.actor.membershipId,
        verificationMethod: 'ONE_TIME_TOKEN',
        tokenVersion: input.authority.proofVersion,
        verifiedAt: input.occurredAt,
      },
      select: { id: true },
    });

    await this.audit.appendTenantUser(transaction, {
      tenantId: input.actor.tenantId,
      actorMembershipId: input.actor.membershipId,
      actorUserId: input.actor.userId,
      eventType: 'inventory.pickup.handoff.completed',
      outcome: 'SUCCEEDED',
      resourceType: 'MedicinePickupHandoff',
      resourceId: handoff.id,
      occurredAt: input.occurredAt,
      metadata: {
        providerId: input.providerId,
        saleId: input.saleId,
        verificationMethod: 'ONE_TIME_TOKEN',
        proofVersion: input.authority.proofVersion,
      },
      request: input.request,
    });
  }

  private async rotateToken(
    transaction: Prisma.TransactionClient,
    current: { readonly id: string; readonly tokenVersion: number; readonly consumedAt: Date | null },
    tokenHash: string,
    issuedAt: Date,
    expiresAt: Date,
  ) {
    if (current.consumedAt) throw new ConflictException('Pickup proof has already been consumed');
    const rotated = await transaction.medicinePickupToken.updateMany({
      where: {
        id: current.id,
        tokenVersion: current.tokenVersion,
        consumedAt: null,
      },
      data: {
        tokenHash,
        tokenVersion: { increment: 1 },
        issuedAt,
        expiresAt,
      },
    });
    if (rotated.count !== 1) {
      throw new SerializableRetryError('Concurrent pickup proof rotation detected');
    }
    return { tokenVersion: current.tokenVersion + 1 };
  }
}

function digestPickupToken(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function matchesDigest(storedHexDigest: string, plaintextToken: string): boolean {
  const actual = Buffer.from(digestPickupToken(plaintextToken), 'hex');
  const expected = Buffer.from(storedHexDigest, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
