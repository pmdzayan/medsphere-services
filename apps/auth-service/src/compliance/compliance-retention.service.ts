import { createHash, randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { withSerializableRetry, type Prisma } from '@medsphere/database';
import { AuditWriter } from '../audit/audit-writer.service';
import { PrismaService } from '../prisma/prisma.service';
import { decideCompliancePolicy } from './compliance-policy';
import type { ComplianceDataClass, ComplianceDisposition } from './compliance.types';

const DAY_MS = 86_400_000;
const SERIALIZABLE_ATTEMPTS = 5;

export interface ComplianceRetentionRunConfig {
  readonly batchSize: number;
  readonly asOf?: Date;
}

export interface ComplianceRetentionRunSummary {
  readonly asOf: Date;
  readonly selected: number;
  readonly completed: number;
  readonly held: number;
  readonly denied: number;
  readonly skipped: number;
  readonly failed: number;
  readonly affectedRows: number;
}

@Injectable()
export class ComplianceRetentionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditWriter,
  ) {}

  async run(config: ComplianceRetentionRunConfig): Promise<ComplianceRetentionRunSummary> {
    const batchSize = validateBatchSize(config.batchSize);
    const asOf = config.asOf ?? new Date();
    if (Number.isNaN(asOf.getTime())) throw new Error('Compliance retention as-of time is invalid');

    const policies = await this.prisma.client.compliancePolicy.findMany({
      where: {
        tenantId: null,
        supersededAt: null,
        retentionDays: { not: null },
        expiryDisposition: { in: ['DELETE', 'ANONYMIZE'] },
        dataClass: { in: ['PATIENT_NOTIFICATION', 'PATIENT_TIMELINE'] },
      },
      orderBy: [{ dataClass: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        dataClass: true,
        allowedPurposes: true,
        retentionDays: true,
        expiryDisposition: true,
        subjectRequestDisposition: true,
        version: true,
      },
    });

    let selected = 0;
    let completed = 0;
    let held = 0;
    let denied = 0;
    let skipped = 0;
    let failed = 0;
    let affectedRows = 0;

    for (const policy of policies) {
      if (selected >= batchSize || policy.retentionDays === null) break;
      const cutoff = new Date(asOf.getTime() - policy.retentionDays * DAY_MS);
      const remaining = batchSize - selected;
      const users = await this.findCandidates(policy.dataClass, cutoff, remaining);

      for (const subjectUserId of users) {
        selected += 1;
        try {
          const result = await this.processCandidate(
            policy,
            subjectUserId,
            cutoff,
            asOf,
          );
          if (result.status === 'COMPLETED') completed += 1;
          if (result.status === 'HELD') held += 1;
          if (result.status === 'DENIED') denied += 1;
          if (result.status === 'SKIPPED') skipped += 1;
          affectedRows += result.affectedRows;
        } catch {
          failed += 1;
        }
      }
    }

    return { asOf, selected, completed, held, denied, skipped, failed, affectedRows };
  }

  private async findCandidates(
    dataClass: ComplianceDataClass,
    cutoff: Date,
    take: number,
  ): Promise<string[]> {
    if (dataClass === 'PATIENT_NOTIFICATION') {
      const rows = await this.prisma.client.patientNotification.findMany({
        where: {
          privacyDispositionAt: null,
          createdAt: { lt: cutoff },
        },
        distinct: ['recipientUserId'],
        orderBy: { recipientUserId: 'asc' },
        take,
        select: { recipientUserId: true },
      });
      return rows.map((row) => row.recipientUserId);
    }

    if (dataClass === 'PATIENT_TIMELINE') {
      const rows = await this.prisma.client.patientTimelineEvent.findMany({
        where: {
          privacyDispositionAt: null,
          occurredAt: { lt: cutoff },
        },
        distinct: ['recipientUserId'],
        orderBy: { recipientUserId: 'asc' },
        take,
        select: { recipientUserId: true },
      });
      return rows.map((row) => row.recipientUserId);
    }

    return [];
  }

  private async processCandidate(
    policy: {
      id: string;
      dataClass: ComplianceDataClass;
      allowedPurposes: readonly (
        | 'ACCOUNT_SECURITY'
        | 'SERVICE_DELIVERY'
        | 'INVENTORY_OPERATIONS'
        | 'BILLING_TAX'
        | 'PRIVACY_PREFERENCE'
        | 'LEGAL_COMPLIANCE'
        | 'AUDIT_SECURITY'
        | 'PATIENT_CARE'
      )[];
      retentionDays: number | null;
      expiryDisposition: ComplianceDisposition;
      subjectRequestDisposition: ComplianceDisposition;
      version: number;
    },
    subjectUserId: string,
    cutoff: Date,
    occurredAt: Date,
  ): Promise<{
    status: 'COMPLETED' | 'HELD' | 'DENIED' | 'SKIPPED';
    affectedRows: number;
  }> {
    return withSerializableRetry(
      this.prisma.client,
      async (transaction) => {
        const hold = await transaction.complianceLegalHold.findFirst({
          where: {
            subjectUserId,
            status: 'ACTIVE',
            OR: [{ dataClass: null }, { dataClass: policy.dataClass }],
          },
          orderBy: [{ placedAt: 'asc' }, { id: 'asc' }],
          select: { id: true, tenantId: true, subjectMembershipId: true },
        });

        const scope = hold
          ? {
              tenantId: hold.tenantId,
              membershipId: hold.subjectMembershipId,
            }
          : await this.findEvidenceMembership(transaction, subjectUserId);
        if (!scope) return { status: 'SKIPPED' as const, affectedRows: 0 };

        const idempotencyKey = hold
          ? `retention-hold:${policy.id}:${subjectUserId}:${hold.id}`
          : `retention:${policy.id}:${subjectUserId}:${cutoff.toISOString().slice(0, 10)}`;
        const commandHash = hashCommand({
          policyId: policy.id,
          policyVersion: policy.version,
          subjectUserId,
          cutoffAt: cutoff.toISOString(),
          disposition: policy.expiryDisposition,
          holdId: hold?.id ?? null,
        });

        const replay = await transaction.complianceDispositionJob.findUnique({
          where: {
            subjectMembershipId_idempotencyKey: {
              subjectMembershipId: scope.membershipId,
              idempotencyKey,
            },
          },
          select: { commandHash: true, status: true, affectedRowCount: true },
        });
        if (replay) {
          if (replay.commandHash !== commandHash) {
            throw new Error('Compliance retention idempotency collision');
          }
          return {
            status: replay.status,
            affectedRows: 0,
          };
        }

        const evaluation = decideCompliancePolicy({
          policy,
          hold,
          purpose: 'LEGAL_COMPLIANCE',
          context: 'RETENTION_EXPIRY',
          requestedDisposition: null,
        });

        const decisionRecord = await transaction.compliancePolicyDecisionRecord.create({
          data: {
            id: randomUUID(),
            tenantId: scope.tenantId,
            subjectUserId,
            subjectMembershipId: scope.membershipId,
            dataClass: policy.dataClass,
            purpose: 'LEGAL_COMPLIANCE',
            context: 'RETENTION_EXPIRY',
            requestedDisposition: null,
            effectiveDisposition: evaluation.effectiveDisposition,
            decision: evaluation.decision,
            policyId: evaluation.policyId,
            legalHoldId: evaluation.legalHoldId,
            evaluatedAt: occurredAt,
          },
          select: { id: true },
        });

        const affected =
          evaluation.decision === 'ALLOW'
            ? await this.executeRetentionDisposition(
                transaction,
                subjectUserId,
                policy.dataClass,
                evaluation.effectiveDisposition,
                cutoff,
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
            tenantId: scope.tenantId,
            subjectUserId,
            subjectMembershipId: scope.membershipId,
            dataClass: policy.dataClass,
            purpose: 'LEGAL_COMPLIANCE',
            source: 'RETENTION_EXPIRY',
            requestedDisposition: null,
            effectiveDisposition: evaluation.effectiveDisposition,
            decision: evaluation.decision,
            status,
            policyId: evaluation.policyId,
            legalHoldId: evaluation.legalHoldId,
            decisionRecordId: decisionRecord.id,
            idempotencyKey,
            commandHash,
            affectedRowCount: affected,
            cutoffAt: cutoff,
            occurredAt,
          },
          select: { id: true },
        });

        await this.audit.appendTenantSystem(transaction, {
          tenantId: scope.tenantId,
          eventType: 'compliance.disposition.processed',
          outcome: evaluation.decision === 'DENY' ? 'DENIED' : 'SUCCEEDED',
          resourceType: 'ComplianceDispositionJob',
          resourceId: job.id,
          occurredAt,
          metadata: {
            dataClass: policy.dataClass,
            source: 'RETENTION_EXPIRY',
            decision: evaluation.decision,
            effectiveDisposition: evaluation.effectiveDisposition,
            status,
            affectedRowCount: affected,
          },
        });

        return { status, affectedRows: affected };
      },
      SERIALIZABLE_ATTEMPTS,
    );
  }

  private async findEvidenceMembership(
    transaction: Prisma.TransactionClient,
    subjectUserId: string,
  ) {
    const membership = await transaction.tenantMembership.findFirst({
      where: { userId: subjectUserId, deletedAt: null },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true, tenantId: true },
    });
    return membership
      ? { tenantId: membership.tenantId, membershipId: membership.id }
      : null;
  }

  private async executeRetentionDisposition(
    transaction: Prisma.TransactionClient,
    subjectUserId: string,
    dataClass: ComplianceDataClass,
    disposition: ComplianceDisposition,
    cutoff: Date,
    occurredAt: Date,
  ): Promise<number> {
    if (disposition === 'RETAIN') return 0;

    if (dataClass === 'PATIENT_NOTIFICATION') {
      if (disposition === 'DELETE') {
        const deleted = await transaction.patientNotification.deleteMany({
          where: {
            recipientUserId: subjectUserId,
            privacyDispositionAt: null,
            createdAt: { lt: cutoff },
          },
        });
        return deleted.count;
      }
      const anonymized = await transaction.patientNotification.updateMany({
        where: {
          recipientUserId: subjectUserId,
          privacyDispositionAt: null,
          createdAt: { lt: cutoff },
        },
        data: {
          title: 'Notification',
          message: 'Content removed by retention policy',
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
          where: {
            recipientUserId: subjectUserId,
            privacyDispositionAt: null,
            occurredAt: { lt: cutoff },
          },
        });
        return deleted.count;
      }
      const anonymized = await transaction.patientTimelineEvent.updateMany({
        where: {
          recipientUserId: subjectUserId,
          privacyDispositionAt: null,
          occurredAt: { lt: cutoff },
        },
        data: {
          title: 'Activity',
          summary: 'Content removed by retention policy',
          destinationType: 'NONE',
          destinationId: null,
          privacyDispositionAt: occurredAt,
        },
      });
      return anonymized.count;
    }

    throw new Error('Unsupported automatic compliance retention data class');
  }
}

function validateBatchSize(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > 100) {
    throw new Error('Compliance retention batch size must be between 1 and 100');
  }
  return value;
}

function hashCommand(value: Readonly<Record<string, unknown>>) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
