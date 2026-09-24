import { randomUUID } from 'node:crypto';
import { AuditWriter } from '../audit/audit-writer.service';
import type { AuthenticatedIdentity } from '../auth/auth.types';
import { isInfrastructureTestEnabled, requireEnv } from '../auth/testing/infrastructure-test-gate';
import type { PlatformAuthenticatedIdentity } from '../platform/platform.types';
import { PrismaService } from '../prisma/prisma.service';
import { ComplianceRetentionService } from './compliance-retention.service';
import { ComplianceService } from './compliance.service';

const describeComplianceInfra = isInfrastructureTestEnabled() ? describe : describe.skip;

if (isInfrastructureTestEnabled()) {
  requireEnv('DATABASE_URL');
}

describeComplianceInfra('Task 0045 compliance PostgreSQL enforcement', () => {
  const prisma = new PrismaService();
  const audit = new AuditWriter();
  const service = new ComplianceService(prisma, audit);
  const retention = new ComplianceRetentionService(prisma, audit);

  const adminUserId = randomUUID();
  const subjectUserId = randomUUID();
  const otherUserId = randomUUID();
  const tenantAId = randomUUID();
  const tenantBId = randomUUID();
  const membershipAId = randomUUID();
  const membershipBId = randomUUID();
  const otherMembershipAId = randomUUID();

  const platformActor: PlatformAuthenticatedIdentity = {
    userId: adminUserId,
    platformAccountId: randomUUID(),
    platformSessionId: randomUUID(),
    securityVersion: 1,
    tokenId: randomUUID(),
  };

  const subjectInA: AuthenticatedIdentity = {
    userId: subjectUserId,
    tenantId: tenantAId,
    membershipId: membershipAId,
    sessionId: randomUUID(),
    securityVersion: 1,
    tokenId: randomUUID(),
  };

  const subjectInB: AuthenticatedIdentity = {
    ...subjectInA,
    tenantId: tenantBId,
    membershipId: membershipBId,
  };

  beforeAll(async () => {
    await prisma.client.tenant.createMany({
      data: [
        {
          id: tenantAId,
          name: 'Task 0045 Tenant A',
          slug: `task-0045-a-${tenantAId.slice(0, 8)}`,
          organizationType: 'PHARMACY',
        },
        {
          id: tenantBId,
          name: 'Task 0045 Tenant B',
          slug: `task-0045-b-${tenantBId.slice(0, 8)}`,
          organizationType: 'PHARMACY',
        },
      ],
    });

    await prisma.client.user.createMany({
      data: [
        {
          id: adminUserId,
          email: `${adminUserId}@task0045.test`,
          passwordHash: 'integration-only-placeholder',
          firstName: 'Platform',
          lastName: 'Admin',
          status: 'ACTIVE',
        },
        {
          id: subjectUserId,
          email: `${subjectUserId}@task0045.test`,
          passwordHash: 'integration-only-placeholder',
          firstName: 'Subject',
          lastName: 'User',
          status: 'ACTIVE',
        },
        {
          id: otherUserId,
          email: `${otherUserId}@task0045.test`,
          passwordHash: 'integration-only-placeholder',
          firstName: 'Other',
          lastName: 'User',
          status: 'ACTIVE',
        },
      ],
    });

    await prisma.client.tenantMembership.createMany({
      data: [
        {
          id: membershipAId,
          tenantId: tenantAId,
          userId: subjectUserId,
          status: 'ACTIVE',
          isDefault: true,
          joinedAt: new Date(),
        },
        {
          id: membershipBId,
          tenantId: tenantBId,
          userId: subjectUserId,
          status: 'ACTIVE',
          isDefault: false,
          joinedAt: new Date(),
        },
        {
          id: otherMembershipAId,
          tenantId: tenantAId,
          userId: otherUserId,
          status: 'ACTIVE',
          isDefault: true,
          joinedAt: new Date(),
        },
      ],
    });

    await service.revisePolicy(
      platformActor,
      'PATIENT_NOTIFICATION',
      {
        allowedPurposes: ['LEGAL_COMPLIANCE'],
        retentionDays: 30,
        expiryDisposition: 'DELETE',
        subjectRequestDisposition: 'ANONYMIZE',
        policyReference: 'task-0045-test-notification',
        expectedVersion: 0,
      },
      {},
    );

    await service.revisePolicy(
      platformActor,
      'PATIENT_TIMELINE',
      {
        allowedPurposes: ['LEGAL_COMPLIANCE'],
        retentionDays: 1,
        expiryDisposition: 'DELETE',
        subjectRequestDisposition: 'RETAIN',
        policyReference: 'task-0045-test-timeline',
        expectedVersion: 0,
      },
      {},
    );

    await service.revisePolicy(
      platformActor,
      'BILLING_FINANCIAL',
      {
        allowedPurposes: ['LEGAL_COMPLIANCE'],
        expiryDisposition: 'RETAIN',
        subjectRequestDisposition: 'RETAIN',
        policyReference: 'task-0045-test-billing-global',
        expectedVersion: 0,
      },
      {},
    );

    await service.revisePolicy(
      platformActor,
      'BILLING_FINANCIAL',
      {
        tenantId: tenantAId,
        allowedPurposes: ['BILLING_TAX'],
        expiryDisposition: 'RETAIN',
        subjectRequestDisposition: 'RETAIN',
        policyReference: 'task-0045-test-billing-a',
        expectedVersion: 0,
      },
      {},
    );
  });

  afterAll(async () => {
    await prisma.client.$disconnect();
  });

  it('keeps tenant policy overrides isolated from another tenant', async () => {
    const deniedA = await service.evaluate(
      platformActor,
      {
        tenantId: tenantAId,
        subjectUserId,
        dataClass: 'BILLING_FINANCIAL',
        purpose: 'LEGAL_COMPLIANCE',
        context: 'ACCESS',
      },
      {},
    );
    const allowedB = await service.evaluate(
      platformActor,
      {
        tenantId: tenantBId,
        subjectUserId,
        dataClass: 'BILLING_FINANCIAL',
        purpose: 'LEGAL_COMPLIANCE',
        context: 'ACCESS',
      },
      {},
    );

    expect(deniedA.decision).toBe('DENY');
    expect(allowedB.decision).toBe('ALLOW');
  });

  it('applies a legal hold from one tenant to global-user projection deletion in another membership', async () => {
    const notificationId = randomUUID();
    await prisma.client.patientNotification.create({
      data: {
        id: notificationId,
        recipientUserId: subjectUserId,
        category: 'SYSTEM',
        title: 'Sensitive title',
        message: 'Sensitive notification content',
        destinationType: 'NONE',
      },
    });

    const hold = await service.placeLegalHold(
      platformActor,
      {
        tenantId: tenantAId,
        subjectUserId,
        dataClass: 'PATIENT_NOTIFICATION',
        reasonCode: 'REGULATORY_REQUEST',
        idempotencyKey: `hold-${randomUUID()}`,
      },
      {},
    );

    const held = await service.requestSubjectDisposition(
      subjectInB,
      {
        dataClass: 'PATIENT_NOTIFICATION',
        requestedDisposition: 'ANONYMIZE',
        idempotencyKey: `subject-held-${randomUUID()}`,
      },
      {},
    );

    expect(held).toMatchObject({
      decision: 'LEGAL_HOLD',
      status: 'HELD',
      affectedRowCount: 0,
    });

    const preserved = await prisma.client.patientNotification.findUniqueOrThrow({
      where: { id: notificationId },
    });
    expect(preserved.title).toBe('Sensitive title');
    expect(preserved.privacyDispositionAt).toBeNull();

    await service.releaseLegalHold(
      platformActor,
      hold.id,
      { expectedVersion: 1 },
      {},
    );

    const completed = await service.requestSubjectDisposition(
      subjectInB,
      {
        dataClass: 'PATIENT_NOTIFICATION',
        requestedDisposition: 'ANONYMIZE',
        idempotencyKey: `subject-complete-${randomUUID()}`,
      },
      {},
    );

    expect(completed.decision).toBe('ALLOW');
    expect(completed.status).toBe('COMPLETED');
    expect(completed.affectedRowCount).toBeGreaterThanOrEqual(1);

    const anonymized = await prisma.client.patientNotification.findUniqueOrThrow({
      where: { id: notificationId },
    });
    expect(anonymized.title).toBe('Notification');
    expect(anonymized.message).toBe('Content removed by privacy policy');
    expect(anonymized.privacyDispositionAt).not.toBeNull();
  });

  it('processes only expired safe projections in the retention worker', async () => {
    const oldId = randomUUID();
    const freshId = randomUUID();
    const asOf = new Date('2026-09-24T00:00:00.000Z');

    await prisma.client.patientTimelineEvent.createMany({
      data: [
        {
          id: oldId,
          recipientUserId: otherUserId,
          sourceType: 'task-0045',
          sourceEventId: randomUUID(),
          eventType: 'RESERVATION_STATUS_CHANGED',
          title: 'Old sensitive event',
          summary: 'Old sensitive summary',
          destinationType: 'NONE',
          occurredAt: new Date('2026-09-20T00:00:00.000Z'),
        },
        {
          id: freshId,
          recipientUserId: otherUserId,
          sourceType: 'task-0045',
          sourceEventId: randomUUID(),
          eventType: 'RESERVATION_STATUS_CHANGED',
          title: 'Fresh event',
          summary: 'Fresh summary',
          destinationType: 'NONE',
          occurredAt: new Date('2026-09-24T00:00:00.000Z'),
        },
      ],
    });

    const summary = await retention.run({ batchSize: 20, asOf });
    expect(summary.failed).toBe(0);
    expect(summary.affectedRows).toBeGreaterThanOrEqual(1);

    await expect(
      prisma.client.patientTimelineEvent.findUnique({ where: { id: oldId } }),
    ).resolves.toBeNull();
    await expect(
      prisma.client.patientTimelineEvent.findUnique({ where: { id: freshId } }),
    ).resolves.toMatchObject({ title: 'Fresh event' });
  });

  it('keeps decision and disposition evidence append-only at PostgreSQL level', async () => {
    const result = await service.requestSubjectDisposition(
      subjectInA,
      {
        dataClass: 'PATIENT_NOTIFICATION',
        requestedDisposition: 'ANONYMIZE',
        idempotencyKey: `append-only-${randomUUID()}`,
      },
      {},
    );

    await expect(
      prisma.client.complianceDispositionJob.delete({ where: { id: result.id } }),
    ).rejects.toBeTruthy();

    const job = await prisma.client.complianceDispositionJob.findUniqueOrThrow({
      where: { id: result.id },
      select: { decisionRecordId: true },
    });
    await expect(
      prisma.client.compliancePolicyDecisionRecord.delete({
        where: { id: job.decisionRecordId },
      }),
    ).rejects.toBeTruthy();
  });
});
