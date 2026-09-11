import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditRequestContext, withSerializableRetry } from '@medsphere/database';
import { AuditWriter } from '../audit/audit-writer.service';
import { PrismaService } from '../prisma/prisma.service';
import { assertTrustedProviderAccess } from './inventory-access';
import type { TrustedInventoryActor } from './inventory-command.types';

export interface AvailabilityRequestPreferenceResult {
  readonly configured: boolean;
  readonly liveRequestsEnabled: boolean;
  readonly timezone: string | null;
  readonly quietHoursStartMinute: number | null;
  readonly quietHoursEndMinute: number | null;
}

export interface ConfigureAvailabilityRequestPreferenceCommand {
  readonly actor: TrustedInventoryActor;
  readonly providerId: string;
  readonly liveRequestsEnabled: boolean;
  readonly timezone: string;
  readonly quietHoursStartMinute?: number | null;
  readonly quietHoursEndMinute?: number | null;
  readonly request?: AuditRequestContext;
}

interface NormalizedAvailabilityRequestPreference {
  readonly liveRequestsEnabled: boolean;
  readonly timezone: string;
  readonly quietHoursStartMinute: number | null;
  readonly quietHoursEndMinute: number | null;
}

@Injectable()
export class AvailabilityRequestPreferenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditWriter,
  ) {}

  async get(
    actor: TrustedInventoryActor,
    providerId: string,
  ): Promise<AvailabilityRequestPreferenceResult> {
    await assertTrustedProviderAccess(this.prisma.client, actor, providerId);
    await this.assertPharmacyProvider(this.prisma.client, actor.tenantId, providerId);

    const preference = await this.prisma.client.pharmacyAvailabilityRequestPreference.findUnique({
      where: { providerId },
      select: {
        liveRequestsEnabled: true,
        timezone: true,
        quietHoursStartMinute: true,
        quietHoursEndMinute: true,
      },
    });

    if (!preference) {
      return {
        configured: false,
        liveRequestsEnabled: false,
        timezone: null,
        quietHoursStartMinute: null,
        quietHoursEndMinute: null,
      };
    }

    return {
      configured: true,
      ...preference,
    };
  }

  async configure(
    command: ConfigureAvailabilityRequestPreferenceCommand,
  ): Promise<AvailabilityRequestPreferenceResult> {
    const normalized = this.validate(command);

    return withSerializableRetry(this.prisma.client, async (transaction) => {
      await assertTrustedProviderAccess(transaction, command.actor, command.providerId);
      await this.assertPharmacyProvider(transaction, command.actor.tenantId, command.providerId);

      // Task 0027: use the exact same provider-scoped PostgreSQL lock as
      // public request admission. Configuration changes and NEW live-request
      // admission must therefore contend on one provider coordination key.
      await transaction.$queryRaw<Array<{ locked: number }>>`
        SELECT 1::int AS "locked"
        FROM pg_advisory_xact_lock(
          hashtext(${command.actor.tenantId}::text),
          hashtext(${command.providerId}::text)
        )
      `;

      const preference = await transaction.pharmacyAvailabilityRequestPreference.upsert({
        where: { providerId: command.providerId },
        create: {
          providerId: command.providerId,
          tenantId: command.actor.tenantId,
          ...normalized,
        },
        update: {
          ...normalized,
        },
        select: {
          liveRequestsEnabled: true,
          timezone: true,
          quietHoursStartMinute: true,
          quietHoursEndMinute: true,
        },
      });

      await this.audit.appendTenantUser(transaction, {
        tenantId: command.actor.tenantId,
        actorMembershipId: command.actor.membershipId,
        actorUserId: command.actor.userId,
        eventType: 'inventory.availability-request.preference.configured',
        outcome: 'SUCCEEDED',
        resourceType: 'PharmacyAvailabilityRequestPreference',
        resourceId: command.providerId,
        metadata: {
          liveRequestsEnabled: preference.liveRequestsEnabled,
          timezone: preference.timezone,
          quietHoursStartMinute: preference.quietHoursStartMinute,
          quietHoursEndMinute: preference.quietHoursEndMinute,
        },
        request: command.request,
      });

      return {
        configured: true,
        ...preference,
      };
    });
  }

  private validate(
    command: ConfigureAvailabilityRequestPreferenceCommand,
  ): NormalizedAvailabilityRequestPreference {
    if (typeof command.liveRequestsEnabled !== 'boolean') {
      throw new BadRequestException('liveRequestsEnabled must be boolean');
    }

    if (typeof command.timezone !== 'string') {
      throw new BadRequestException('timezone must be a string');
    }

    const timezone = command.timezone.trim();

    if (timezone.length < 1 || timezone.length > 64) {
      throw new BadRequestException('timezone must contain between 1 and 64 characters');
    }

    try {
      new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date(0));
    } catch {
      throw new BadRequestException('timezone must be a valid IANA timezone');
    }

    const quietHoursStartMinute = command.quietHoursStartMinute ?? null;
    const quietHoursEndMinute = command.quietHoursEndMinute ?? null;

    if ((quietHoursStartMinute === null) !== (quietHoursEndMinute === null)) {
      throw new BadRequestException(
        'quietHoursStartMinute and quietHoursEndMinute must both be supplied or both be null',
      );
    }

    for (const value of [quietHoursStartMinute, quietHoursEndMinute]) {
      if (value !== null && (!Number.isInteger(value) || value < 0 || value > 1439)) {
        throw new BadRequestException('quiet-hour minutes must be integers from 0 through 1439');
      }
    }

    return {
      liveRequestsEnabled: command.liveRequestsEnabled,
      timezone,
      quietHoursStartMinute,
      quietHoursEndMinute,
    };
  }

  private async assertPharmacyProvider(
    database: {
      provider: {
        findFirst(args: unknown): Promise<{ id: string } | null>;
      };
    },
    tenantId: string,
    providerId: string,
  ): Promise<void> {
    const provider = await database.provider.findFirst({
      where: {
        id: providerId,
        tenantId,
        providerType: 'PHARMACY',
      },
      select: { id: true },
    });

    if (!provider) {
      throw new NotFoundException('Provider inventory not found');
    }
  }
}
