import { Injectable } from '@nestjs/common';
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
   * Records a new consent event (grant or withdrawal) as an append-only
   * row -- never an update of a prior row. Withdrawal only affects
   * future behavior (the caller's next status read reflects it); it
   * never deletes or rewrites the historical GRANTED row, preserving
   * evidence of what was actually granted and when.
   */
  async recordConsent(
    identity: AuthenticatedIdentity,
    category: ConsentCategory,
    status: 'GRANTED' | 'WITHDRAWN',
    source: ConsentSource,
  ): Promise<ConsentStatusDto> {
    const record = await this.consentRepository.append(identity.userId, category, status, source);

    await this.audit.appendTenantUser(this.prisma.client, {
      eventType: status === 'GRANTED' ? 'privacy.consent.granted' : 'privacy.consent.withdrawn',
      outcome: 'SUCCEEDED',
      tenantId: identity.tenantId,
      actorMembershipId: identity.membershipId,
      // Only the bounded category name is recorded -- never the
      // source string verbatim beyond what's already a fixed,
      // non-identifying tag, and never any location/notification
      // payload content, since none is ever collected here.
      metadata: { category },
    });

    return {
      category,
      status: record.status as 'GRANTED' | 'WITHDRAWN',
      updatedAt: record.createdAt.toISOString(),
    };
  }

  /**
   * Current effective consent per category -- the latest row for each,
   * or null (never asked) when no row exists yet for that category.
   */
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
}
