import { createHash, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { withSerializableRetry, type Prisma } from '@medsphere/database';
import { AuditWriter } from '../audit/audit-writer.service';
import type { AuthenticatedIdentity, RequestMetadata } from '../auth/auth.types';
import type { PlatformAuthenticatedIdentity } from '../platform/platform.types';
import { PrismaService } from '../prisma/prisma.service';
import { decideCompliancePolicy } from './compliance-policy';
import {
  COMPLIANCE_DATA_CLASS_CATALOG,
  complianceDataClassDescriptor,
  isComplianceDataClass,
  type ComplianceDataClass,
  type ComplianceDisposition,
} from './compliance.types';
import type {
  EvaluateCompliancePolicyDto,
  ListComplianceLegalHoldsQueryDto,
  ListCompliancePoliciesQueryDto,
  PlaceComplianceLegalHoldDto,
  ReleaseComplianceLegalHoldDto,
  RequestComplianceDispositionDto,
  ReviseCompliancePolicyDto,
} from './dto/compliance.dto';

const SERIALIZABLE_ATTEMPTS = 5;
const MAX_LIST_RESULTS = 100;

@Injectable()
export class ComplianceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditWriter,
  ) {}

  listDataClasses() {
    return { data: COMPLIANCE_DATA_CLASS_CATALOG };
  }

  async listPolicies(query: ListCompliancePoliciesQueryDto) {
    const data = await this.prisma.client.compliancePolicy.findMany({
      where: {
        supersededAt: null,
        ...(query.tenantId
          ? { OR: [{ tenantId: null }, { tenantId: query.tenantId }] }
          : { tenantId: null }),
      },
      orderBy: [{ dataClass: 'asc' }, { tenantId: 'asc' }],
      take: MAX_LIST_RESULTS,
      select: {
        id: true,
        tenantId: true,
        dataClass: true,
        allowedPurposes: true,
        retentionDays: true,
        expiryDisposition: true,
        subjectRequestDisposition: true,
        policyReference: true,
        version: true,
        effectiveAt: true,
      },
    });
    return { data };
  }

  async revisePolicy(
    actor: PlatformAuthenticatedIdentity,
    dataClassValue: string,
    dto: ReviseCompliancePolicyDto,
    request: RequestMetadata,
  ) {
    if (!isComplianceDataClass(dataClassValue)) {
      throw new BadRequestException('Unknown compliance data class');
    }
    const dataClass = dataClassValue;
    this.validatePolicy(dataClass, dto);

    return withSerializableRetry(
      this.prisma.client,
      async (transaction) => {
        if (dto.tenantId) {
          await this.assertTenantExists(transaction, dto.tenantId);
        }

        const current = await transaction.compliancePolicy.findFirst({
          where: {
            tenantId: dto.tenantId ?? null,
            dataClass,
            supersededAt: null,
          },
          select: { id: true, version: true },
        });

        if (current) {
          if (dto.expectedVersion !== current.version) {
            throw new ConflictException('Compliance policy version conflict');
          }
        } else if (dto.expectedVersion !== undefined && dto.expectedVersion !== 0) {
          throw new ConflictException('Compliance policy does not exist at expected version');
        }

        const occurredAt = new Date();
        if (current) {
          const superseded = await transaction.compliancePolicy.updateMany({
            where: { id: current.id, supersededAt: null },
            data: { supersededAt: occurredAt },
          });
          if (superseded.count !== 1) {
            throw new ConflictException('Compliance policy revision conflict');
          }
        }

        const version = (current?.version ?? 0) + 1;
        const policy = await transaction.compliancePolicy.create({
          data: {
            id: randomUUID(),
            tenantId: dto.tenantId ?? null,
            dataClass,
            allowedPurposes: dto.allowedPurposes,
            retentionDays: dto.retentionDays ?? null,
            expiryDisposition: dto.expiryDisposition,
            subjectRequestDisposition: dto.subjectRequestDisposition,
            policyReference: dto.policyReference.trim(),
            version,
            effectiveAt: occurredAt,
            createdByPlatformUserId: actor.userId,
          },
          select: {
            id: true,
            tenantId: true,
            dataClass: true,
            allowedPurposes: true,
            retentionDays: true,
            expiryDisposition: true,
            subjectRequestDisposition: true,
            policyReference: true,
            version: true,
            effectiveAt: true,
          },
        });

        await this.audit.appendPlatformUser(transaction, {
          platformActorUserId: actor.userId,
          eventType: 'compliance.policy.revised',
          outcome: 'SUCCEEDED',
          resourceType: 'CompliancePolicy',
          resourceId: policy.id,
          occurredAt,
          metadata: {
            dataClass,
            scope: dto.tenantId ? 'TENANT' : 'PLATFORM',
            version,
            expiryDisposition: dto.expiryDisposition,
            subjectRequestDisposition: dto.subjectRequestDisposition,
          },
          request,
        });

        return policy;
      },
      SERIALIZABLE_ATTEMPTS,
    );
  }

  async listLegalHolds(query: ListComplianceLegalHoldsQueryDto) {
    const data = await this.prisma.client.complianceLegalHold.findMany({
      where: {
        ...(query.tenantId ? { tenantId: query.tenantId } : {}),
        ...(query.subjectUserId ? { subjectUserId: query.subjectUserId } : {}),
        ...(query.status ? { status: query.status } : {}),
      },
      orderBy: [{ placedAt: 'desc' }, { id: 'desc' }],
      take: MAX_LIST_RESULTS,
      select: {
        id: true,
        tenantId: true,
        subjectUserId: true,
        subjectMembershipId: true,
        dataClass: true,
        reasonCode: true,
        status: true,
        version: true,
        placedAt: true,
        releasedAt: true,
      },
    });
    return { data };
  }

  async placeLegalHold(
    actor: PlatformAuthenticatedIdentity,
    dto: PlaceComplianceLegalHoldDto,
    request: RequestMetadata,
  ) {
    const commandHash = hashCommand({
      tenantId: dto.tenantId,
      subjectUserId: dto.subjectUserId,
      dataClass: dto.dataClass ?? null,
      reasonCode: dto.reasonCode,
      referenceHash: dto.referenceHash ?? null,
    });

    return withSerializableRetry(
      this.prisma.client,
      async (transaction) => {
        const replay = await transaction.complianceLegalHold.findUnique({
          where: {
            placedByPlatformUserId_idempotencyKey: {
              placedByPlatformUserId: actor.userId,
              idempotencyKey: dto.idempotencyKey,
            },
          },
          select: {
            id: true,
            tenantId: true,
            subjectUserId: true,
            subjectMembershipId: true,
            dataClass: true,
            reasonCode: true,
            status: true,
            commandHash: true,
            version: true,
            placedAt: true,
            releasedAt: true,
          },
        });
        if (replay) {
          if (replay.commandHash !== commandHash) {
            throw new ConflictException(
              'Legal-hold idempotency key was reused with different input',
            );
          }
          return { ...withoutCommandHash(replay), replayed: true };
        }

        const membership = await this.assertTenantSubject(
          transaction,
          dto.tenantId,
          dto.subjectUserId,
        );

        const overlap = await transaction.complianceLegalHold.findFirst({
          where: {
            tenantId: dto.tenantId,
            subjectMembershipId: membership.id,
            status: 'ACTIVE',
            OR: [{ dataClass: null }, ...(dto.dataClass ? [{ dataClass: dto.dataClass }] : [])],
          },
          select: { id: true },
        });
        if (overlap) {
          throw new ConflictException('An overlapping active legal hold already exists');
        }
        if (!dto.dataClass) {
          const anyActive = await transaction.complianceLegalHold.findFirst({
            where: {
              tenantId: dto.tenantId,
              subjectMembershipId: membership.id,
              status: 'ACTIVE',
            },
            select: { id: true },
          });
          if (anyActive) {
            throw new ConflictException('An overlapping active legal hold already exists');
          }
        }

        const occurredAt = new Date();
        const hold = await transaction.complianceLegalHold.create({
          data: {
            id: randomUUID(),
            tenantId: dto.tenantId,
            subjectUserId: dto.subjectUserId,
            subjectMembershipId: membership.id,
            dataClass: dto.dataClass ?? null,
            reasonCode: dto.reasonCode,
            referenceHash: dto.referenceHash ?? null,
            status: 'ACTIVE',
            placedByPlatformUserId: actor.userId,
            idempotencyKey: dto.idempotencyKey,
            commandHash,
            version: 1,
            placedAt: occurredAt,
          },
          select: {
            id: true,
            tenantId: true,
            subjectUserId: true,
            subjectMembershipId: true,
            dataClass: true,
            reasonCode: true,
            status: true,
            version: true,
            placedAt: true,
            releasedAt: true,
          },
        });

        await this.audit.appendPlatformUser(transaction, {
          platformActorUserId: actor.userId,
          eventType: 'compliance.legal-hold.placed',
          outcome: 'SUCCEEDED',
          resourceType: 'ComplianceLegalHold',
          resourceId: hold.id,
          occurredAt,
          metadata: {
            dataClass: dto.dataClass ?? 'ALL',
            reasonCode: dto.reasonCode,
            scope: 'TENANT_SUBJECT',
          },
          request,
        });

        return { ...hold, replayed: false };
      },
      SERIALIZABLE_ATTEMPTS,
    );
  }

  async releaseLegalHold(
    actor: PlatformAuthenticatedIdentity,
    holdId: string,
    dto: ReleaseComplianceLegalHoldDto,
    request: RequestMetadata,
  ) {
    return withSerializableRetry(
      this.prisma.client,
      async (transaction) => {
        const hold = await transaction.complianceLegalHold.findUnique({
          where: { id: holdId },
          select: {
            id: true,
            tenantId: true,
            subjectUserId: true,
            subjectMembershipId: true,
            dataClass: true,
            reasonCode: true,
            status: true,
            version: true,
          },
        });
        if (!hold) throw new NotFoundException('Compliance legal hold not found');
        if (hold.status !== 'ACTIVE') {
          throw new ConflictException('Compliance legal hold is not active');
        }
        if (hold.version !== dto.expectedVersion) {
          throw new ConflictException('Compliance legal hold version conflict');
        }

        const occurredAt = new Date();
        const updated = await transaction.complianceLegalHold.updateMany({
          where: { id: hold.id, status: 'ACTIVE', version: hold.version },
          data: {
            status: 'RELEASED',
            releasedByPlatformUserId: actor.userId,
            releasedAt: occurredAt,
            version: { increment: 1 },
          },
        });
        if (updated.count !== 1) {
          throw new ConflictException('Compliance legal hold release conflict');
        }

        const result = await transaction.complianceLegalHold.findUniqueOrThrow({
          where: { id: hold.id },
          select: {
            id: true,
            tenantId: true,
            subjectUserId: true,
            subjectMembershipId: true,
            dataClass: true,
            reasonCode: true,
            status: true,
            version: true,
            placedAt: true,
            releasedAt: true,
          },
        });

        await this.audit.appendPlatformUser(transaction, {
          platformActorUserId: actor.userId,
          eventType: 'compliance.legal-hold.released',
          outcome: 'SUCCEEDED',
          resourceType: 'ComplianceLegalHold',
          resourceId: hold.id,
          occurredAt,
          metadata: {
            dataClass: hold.dataClass ?? 'ALL',
            reasonCode: hold.reasonCode,
            scope: 'TENANT_SUBJECT',
            resultingVersion: result.version,
          },
          request,
        });

        return result;
      },
      SERIALIZABLE_ATTEMPTS,
    );
  }

  async evaluate(
    actor: PlatformAuthenticatedIdentity,
    dto: EvaluateCompliancePolicyDto,
    request: RequestMetadata,
  ) {
    this.validateEvaluationInput(dto.context, dto.requestedDisposition);

    return withSerializableRetry(
      this.prisma.client,
      async (transaction) => {
        const membership = await this.assertTenantSubject(
          transaction,
          dto.tenantId,
          dto.subjectUserId,
        );
        const policy = await this.resolvePolicy(transaction, dto.tenantId, dto.dataClass);
        const hold = await this.findEffectiveHold(
          transaction,
          dto.tenantId,
          dto.subjectUserId,
          dto.dataClass,
        );

        const evaluation = decideCompliancePolicy({
          policy,
          hold,
          purpose: dto.purpose,
          context: dto.context,
          requestedDisposition: dto.requestedDisposition ?? null,
        });

        const occurredAt = new Date();
        const evidence = await transaction.compliancePolicyDecisionRecord.create({
          data: {
            id: randomUUID(),
            tenantId: dto.tenantId,
            subjectUserId: dto.subjectUserId,
            subjectMembershipId: membership.id,
            dataClass: dto.dataClass,
            purpose: dto.purpose,
            context: dto.context,
            requestedDisposition: dto.requestedDisposition ?? null,
            effectiveDisposition: evaluation.effectiveDisposition,
            decision: evaluation.decision,
            policyId: evaluation.policyId,
            legalHoldId: evaluation.legalHoldId,
            evaluatedByPlatformUserId: actor.userId,
            evaluatedAt: occurredAt,
          },
          select: { id: true, evaluatedAt: true },
        });

        await this.audit.appendPlatformUser(transaction, {
          platformActorUserId: actor.userId,
          eventType: 'compliance.policy.evaluated',
          outcome: evaluation.decision === 'DENY' ? 'DENIED' : 'SUCCEEDED',
          resourceType: 'CompliancePolicyDecisionRecord',
          resourceId: evidence.id,
          occurredAt,
          metadata: {
            dataClass: dto.dataClass,
            purpose: dto.purpose,
            context: dto.context,
            decision: evaluation.decision,
            effectiveDisposition: evaluation.effectiveDisposition,
          },
          request,
        });

        return {
          decisionId: evidence.id,
          decision: evaluation.decision,
          effectiveDisposition: evaluation.effectiveDisposition,
          policyId: evaluation.policyId,
          policyVersion: evaluation.policyVersion,
          legalHoldApplied: evaluation.legalHoldId !== null,
          evaluatedAt: evidence.evaluatedAt,
        };
      },
      SERIALIZABLE_ATTEMPTS,
    );
  }

  async requestSubjectDisposition(
    identity: AuthenticatedIdentity,
    dto: RequestComplianceDispositionDto,
    request: RequestMetadata,
  ) {
    const descriptor = complianceDataClassDescriptor(dto.dataClass);
    if (descriptor.scope !== 'GLOBAL_USER') {
      throw new BadRequestException(
        'This data class does not support a global self-service disposition request',
      );
    }
    if (!descriptor.subjectRequestDispositions.includes(dto.requestedDisposition)) {
      throw new BadRequestException('Requested disposition is not executable for this data class');
    }

    const commandHash = hashCommand({
      dataClass: dto.dataClass,
      requestedDisposition: dto.requestedDisposition,
    });

    return withSerializableRetry(
      this.prisma.client,
      async (transaction) => {
        await this.assertExactIdentityMembership(transaction, identity);

        const replay = await transaction.complianceDispositionJob.findUnique({
          where: {
            subjectMembershipId_idempotencyKey: {
              subjectMembershipId: identity.membershipId,
              idempotencyKey: dto.idempotencyKey,
            },
          },
          select: {
            id: true,
            dataClass: true,
            requestedDisposition: true,
            effectiveDisposition: true,
            decision: true,
            status: true,
            commandHash: true,
            affectedRowCount: true,
            occurredAt: true,
          },
        });
        if (replay) {
          if (replay.commandHash !== commandHash) {
            throw new ConflictException(
              'Disposition idempotency key was reused with different input',
            );
          }
          return { ...withoutCommandHash(replay), replayed: true };
        }

        const policy = await this.resolvePolicy(transaction, identity.tenantId, dto.dataClass);
        const hold = await this.findEffectiveHold(
          transaction,
          identity.tenantId,
          identity.userId,
          dto.dataClass,
        );
        const evaluation = decideCompliancePolicy({
          policy,
          hold,
          purpose: 'LEGAL_COMPLIANCE',
          context: 'SUBJECT_REQUEST',
          requestedDisposition: dto.requestedDisposition,
        });
        const occurredAt = new Date();

        const evidence = await transaction.compliancePolicyDecisionRecord.create({
          data: {
            id: randomUUID(),
            tenantId: identity.tenantId,
            subjectUserId: identity.userId,
            subjectMembershipId: identity.membershipId,
            dataClass: dto.dataClass,
            purpose: 'LEGAL_COMPLIANCE',
            context: 'SUBJECT_REQUEST',
            requestedDisposition: dto.requestedDisposition,
            effectiveDisposition: evaluation.effectiveDisposition,
            decision: evaluation.decision,
            policyId: evaluation.policyId,
            legalHoldId: evaluation.legalHoldId,
            evaluatedAt: occurredAt,
          },
          select: { id: true },
        });

        const affectedRowCount =
          evaluation.decision === 'ALLOW'
            ? await this.executeSubjectDisposition(
                transaction,
                identity.userId,
                dto.dataClass,
                evaluation.effectiveDisposition,
                occurredAt,
              )
            : 0;
        const status =
          evaluation.decision === 'DENY'
            ? 'DENIED'
            : evaluation.decision === 'LEGAL_HOLD'
              ? 'HELD'
              : 'COMPLETED';

        const job = await transaction.complianceDispositionJob.create({
          data: {
            id: randomUUID(),
            tenantId: identity.tenantId,
            subjectUserId: identity.userId,
            subjectMembershipId: identity.membershipId,
            dataClass: dto.dataClass,
            purpose: 'LEGAL_COMPLIANCE',
            source: 'SUBJECT_REQUEST',
            requestedDisposition: dto.requestedDisposition,
            effectiveDisposition: evaluation.effectiveDisposition,
            decision: evaluation.decision,
            status,
            policyId: evaluation.policyId,
            legalHoldId: evaluation.legalHoldId,
            decisionRecordId: evidence.id,
            idempotencyKey: dto.idempotencyKey,
            commandHash,
            affectedRowCount,
            occurredAt,
          },
          select: {
            id: true,
            dataClass: true,
            requestedDisposition: true,
            effectiveDisposition: true,
            decision: true,
            status: true,
            affectedRowCount: true,
            occurredAt: true,
          },
        });

        await this.audit.appendTenantUser(transaction, {
          tenantId: identity.tenantId,
          actorMembershipId: identity.membershipId,
          actorUserId: identity.userId,
          eventType: 'compliance.disposition.processed',
          outcome: evaluation.decision === 'DENY' ? 'DENIED' : 'SUCCEEDED',
          resourceType: 'ComplianceDispositionJob',
          resourceId: job.id,
          occurredAt,
          metadata: {
            dataClass: dto.dataClass,
            source: 'SUBJECT_REQUEST',
            decision: evaluation.decision,
            effectiveDisposition: evaluation.effectiveDisposition,
            status,
            affectedRowCount,
          },
          request,
        });

        return { ...job, replayed: false };
      },
      SERIALIZABLE_ATTEMPTS,
    );
  }

  async listSubjectDispositionJobs(identity: AuthenticatedIdentity, limit: number) {
    const safeLimit = Number.isSafeInteger(limit) && limit >= 1 && limit <= 50 ? limit : 25;
    const data = await this.prisma.client.complianceDispositionJob.findMany({
      where: {
        tenantId: identity.tenantId,
        subjectUserId: identity.userId,
        subjectMembershipId: identity.membershipId,
        source: 'SUBJECT_REQUEST',
      },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: safeLimit,
      select: {
        id: true,
        dataClass: true,
        requestedDisposition: true,
        effectiveDisposition: true,
        decision: true,
        status: true,
        affectedRowCount: true,
        occurredAt: true,
      },
    });
    return { data };
  }

  private validatePolicy(dataClass: ComplianceDataClass, dto: ReviseCompliancePolicyDto) {
    const descriptor = complianceDataClassDescriptor(dataClass);
    if (!dto.policyReference.trim()) {
      throw new BadRequestException('Policy reference is required');
    }
    if (descriptor.scope === 'GLOBAL_USER' && dto.tenantId) {
      throw new BadRequestException('Global-user data classes require a platform baseline policy');
    }
    if (!descriptor.retentionDispositions.includes(dto.expiryDisposition)) {
      throw new BadRequestException('Expiry disposition is not executable for this data class');
    }
    if (!descriptor.subjectRequestDispositions.includes(dto.subjectRequestDisposition)) {
      throw new BadRequestException(
        'Subject-request disposition is not executable for this data class',
      );
    }
    if (dto.expiryDisposition !== 'RETAIN' && dto.retentionDays === undefined) {
      throw new BadRequestException(
        'A destructive expiry disposition requires an explicit retention period',
      );
    }
  }

  private validateEvaluationInput(
    context: 'ACCESS' | 'SUBJECT_REQUEST' | 'RETENTION_EXPIRY',
    requestedDisposition: ComplianceDisposition | undefined,
  ) {
    if (context === 'ACCESS' && requestedDisposition !== undefined) {
      throw new BadRequestException('ACCESS evaluation cannot request a disposition');
    }
    if (context === 'SUBJECT_REQUEST' && requestedDisposition === undefined) {
      throw new BadRequestException('SUBJECT_REQUEST requires a requested disposition');
    }
    if (context === 'RETENTION_EXPIRY' && requestedDisposition !== undefined) {
      throw new BadRequestException('RETENTION_EXPIRY uses the policy expiry disposition');
    }
  }

  private async resolvePolicy(
    transaction: Prisma.TransactionClient,
    tenantId: string,
    dataClass: ComplianceDataClass,
  ) {
    const descriptor = complianceDataClassDescriptor(dataClass);
    if (descriptor.scope === 'TENANT') {
      const tenantPolicy = await transaction.compliancePolicy.findFirst({
        where: { tenantId, dataClass, supersededAt: null },
        select: policySelection,
      });
      if (tenantPolicy) return tenantPolicy;
    }

    return transaction.compliancePolicy.findFirst({
      where: { tenantId: null, dataClass, supersededAt: null },
      select: policySelection,
    });
  }

  private async findEffectiveHold(
    transaction: Prisma.TransactionClient,
    tenantId: string,
    subjectUserId: string,
    dataClass: ComplianceDataClass,
  ) {
    const descriptor = complianceDataClassDescriptor(dataClass);
    return transaction.complianceLegalHold.findFirst({
      where: {
        ...(descriptor.scope === 'TENANT' ? { tenantId } : {}),
        subjectUserId,
        status: 'ACTIVE',
        OR: [{ dataClass: null }, { dataClass }],
      },
      orderBy: [{ placedAt: 'asc' }, { id: 'asc' }],
      select: { id: true, tenantId: true, subjectMembershipId: true },
    });
  }

  private async executeSubjectDisposition(
    transaction: Prisma.TransactionClient,
    userId: string,
    dataClass: ComplianceDataClass,
    disposition: ComplianceDisposition,
    occurredAt: Date,
  ): Promise<number> {
    if (disposition === 'RETAIN') return 0;

    if (dataClass === 'PRIVACY_PREFERENCES') {
      const deleted = await transaction.userPrivacy.deleteMany({ where: { userId } });
      return deleted.count;
    }

    if (dataClass === 'PATIENT_NOTIFICATION') {
      if (disposition === 'DELETE') {
        const deleted = await transaction.patientNotification.deleteMany({
          where: { recipientUserId: userId },
        });
        return deleted.count;
      }
      const anonymized = await transaction.patientNotification.updateMany({
        where: { recipientUserId: userId, privacyDispositionAt: null },
        data: {
          title: 'Notification',
          message: 'Content removed by privacy policy',
          destinationType: 'NONE',
          destinationId: null,
          privacyDispositionAt: occurredAt,
        },
      });
      return anonymized.count;
    }

    if (dataClass === 'PATIENT_TIMELINE') {
      if (disposition === 'DELETE') {
        const deleted = await transaction.patientTimelineEvent.deleteMany({
          where: { recipientUserId: userId },
        });
        return deleted.count;
      }
      const anonymized = await transaction.patientTimelineEvent.updateMany({
        where: { recipientUserId: userId, privacyDispositionAt: null },
        data: {
          title: 'Activity',
          summary: 'Content removed by privacy policy',
          destinationType: 'NONE',
          destinationId: null,
          privacyDispositionAt: occurredAt,
        },
      });
      return anonymized.count;
    }

    throw new BadRequestException('No destructive executor exists for this data class');
  }

  private async assertTenantExists(transaction: Prisma.TransactionClient, tenantId: string) {
    const tenant = await transaction.tenant.findFirst({
      where: { id: tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!tenant) throw new NotFoundException('Compliance scope not found');
  }

  private async assertTenantSubject(
    transaction: Prisma.TransactionClient,
    tenantId: string,
    userId: string,
  ) {
    const membership = await transaction.tenantMembership.findFirst({
      where: { tenantId, userId, deletedAt: null },
      select: { id: true, tenantId: true, userId: true },
    });
    if (!membership) throw new NotFoundException('Compliance scope not found');
    return membership;
  }

  private async assertExactIdentityMembership(
    transaction: Prisma.TransactionClient,
    identity: AuthenticatedIdentity,
  ) {
    const membership = await transaction.tenantMembership.findFirst({
      where: {
        id: identity.membershipId,
        tenantId: identity.tenantId,
        userId: identity.userId,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!membership) throw new NotFoundException('Compliance scope not found');
  }
}

const policySelection = {
  id: true,
  allowedPurposes: true,
  retentionDays: true,
  expiryDisposition: true,
  subjectRequestDisposition: true,
  version: true,
} as const;

function hashCommand(value: Readonly<Record<string, unknown>>) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function withoutCommandHash<T extends { commandHash: string }>(value: T): Omit<T, 'commandHash'> {
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== 'commandHash'),
  ) as Omit<T, 'commandHash'>;
}
