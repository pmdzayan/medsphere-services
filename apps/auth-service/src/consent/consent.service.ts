import { Injectable } from '@nestjs/common';
import { withSerializableRetry, type Prisma } from '@medsphere/database';
import { PrismaService } from '../prisma/prisma.service';
import { AuditWriter } from '../audit/audit-writer.service';
import { AuthenticatedIdentity } from '../auth/auth.types';
import { ConsentRepository } from './consent.repository';
import { CONSENT_CATEGORIES, ConsentCategory, ConsentSource } from './consent-category';
import { ConsentStatusDto } from './dto/consent.dto';

@Injectable()
export class ConsentService {
  constructor(
    private readonly consentRepository: ConsentRepository,
    private readonly audit: AuditWriter,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Task 0045 closes the withdrawal-consequence gap. The append-only consent
   * event, any preference shutoff, and the audit event commit atomically.
   * A grant never silently opts the user into notifications; it only records
   * consent. A withdrawal can only reduce future processing.
   */
  async recordConsent(
    identity: AuthenticatedIdentity,
    category: ConsentCategory,
    status: 'GRANTED' | 'WITHDRAWN',
    source: ConsentSource,
  ): Promise<ConsentStatusDto> {
    return withSerializableRetry(this.prisma.client, async (transaction) => {
      const record = await this.consentRepository.appendWith(
        transaction,
        identity.userId,
        category,
        status,
        source,
      );

      if (status === 'WITHDRAWN') {
        await this.applyWithdrawalConsequence(transaction, identity.userId, category);
      }

      await this.audit.appendTenantUser(transaction, {
        eventType: status === 'GRANTED' ? 'privacy.consent.granted' : 'privacy.consent.withdrawn',
        outcome: 'SUCCEEDED',
        tenantId: identity.tenantId,
        actorMembershipId: identity.membershipId,
        actorUserId: identity.userId,
        metadata: { category },
      });

      return {
        category,
        status: record.status as 'GRANTED' | 'WITHDRAWN',
        updatedAt: record.createdAt.toISOString(),
      };
    });
  }

  async getConsentStatus(userId: string): Promise<ConsentStatusDto[]> {
    const latestByCategory = await this.consentRepository.findLatestPerCategory(userId);
    return CONSENT_CATEGORIES.map((category) => {
      const record = latestByCategory.get(category);
      return {
        category,
        status: record ? (record.status as 'GRANTED' | 'WITHDRAWN') : null,
        updatedAt: record ? record.createdAt.toISOString() : null,
      };
    });
  }

  private async applyWithdrawalConsequence(
    transaction: Prisma.TransactionClient,
    userId: string,
    category: ConsentCategory,
  ) {
    if (category === 'NOTIFICATIONS_RESERVATIONS') {
      await transaction.userPrivacy.updateMany({
        where: { userId },
        data: { wantsReservationNotifications: false },
      });
      return;
    }

    if (category === 'NOTIFICATIONS_OPERATIONAL') {
      await transaction.userPrivacy.updateMany({
        where: { userId },
        data: { wantsOperationalAlerts: false },
      });
    }

    // LOCATION_USE has no persisted background-location state in AIM. Its
    // withdrawal consequence is therefore enforced by the existing
    // request-time permission boundary rather than a stored-data mutation.
  }
}
