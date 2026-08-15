import { Injectable } from '@nestjs/common';
import type { NotificationChannel, NotificationRecipientType } from '@medsphere/database';
import { PrismaService } from '../prisma/prisma.service';
import type { NotificationRecipientResolver } from './notification.contracts';
import { NotificationDeliveryFailure } from './notification.errors';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_DESTINATION_PATTERN = /^[^\s@]+@[^\s@]+$/;
const RESOLUTION_PROVIDER_KEY = 'recipient-resolution';

interface ReservationRecipientResolutionInput {
  readonly tenantId: string;
  readonly recipientType: NotificationRecipientType;
  readonly recipientReferenceId: string;
  readonly channel: NotificationChannel;
}

@Injectable()
export class ReservationRecipientResolverService implements NotificationRecipientResolver {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(
    input: ReservationRecipientResolutionInput,
  ): Promise<{ readonly destinationToken: string }> {
    if (input.recipientType !== 'TENANT_MEMBERSHIP') {
      throw failure('RECIPIENT_TYPE_UNSUPPORTED');
    }
    if (input.channel !== 'EMAIL') {
      throw failure('RECIPIENT_CHANNEL_UNSUPPORTED');
    }
    if (!UUID_PATTERN.test(input.tenantId) || !UUID_PATTERN.test(input.recipientReferenceId)) {
      throw failure('RECIPIENT_REFERENCE_INVALID');
    }

    const membership = await this.prisma.client.tenantMembership.findFirst({
      where: {
        id: input.recipientReferenceId,
        tenantId: input.tenantId,
      },
      select: {
        status: true,
        endedAt: true,
        deletedAt: true,
        tenant: {
          select: {
            isActive: true,
            deletedAt: true,
          },
        },
        user: {
          select: {
            email: true,
            status: true,
            deletedAt: true,
          },
        },
      },
    });

    if (!membership) {
      throw failure('RECIPIENT_UNAVAILABLE');
    }
    if (
      membership.status !== 'ACTIVE' ||
      membership.endedAt !== null ||
      membership.deletedAt !== null ||
      !membership.tenant.isActive ||
      membership.tenant.deletedAt !== null ||
      membership.user.status !== 'ACTIVE' ||
      membership.user.deletedAt !== null
    ) {
      throw failure('RECIPIENT_DISABLED');
    }

    const destinationToken = membership.user.email;
    if (!isValidEmailDestination(destinationToken)) {
      throw failure('RECIPIENT_DESTINATION_INVALID');
    }

    return { destinationToken };
  }
}

function isValidEmailDestination(value: string): boolean {
  return (
    value.length >= 3 &&
    value.length <= 320 &&
    value === value.trim() &&
    EMAIL_DESTINATION_PATTERN.test(value)
  );
}

function failure(code: string): NotificationDeliveryFailure {
  return new NotificationDeliveryFailure(code, RESOLUTION_PROVIDER_KEY);
}
