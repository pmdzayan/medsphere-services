import { randomBytes, randomUUID } from 'node:crypto';
import { AuditWriter } from '../../audit/audit-writer.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  isInfrastructureTestEnabled,
  requireEnv,
} from '../../auth/testing/infrastructure-test-gate';
import { AccountVerificationService } from '../account-verification.service';
import { PhoneOtpService } from './phone-otp.service';
import {
  ContractSmsProviderRegistry,
  type ActivatedSmsProviderAdapter,
} from './sms-provider-activation.contracts';

const describeOtpInfrastructure = isInfrastructureTestEnabled() ? describe : describe.skip;

if (isInfrastructureTestEnabled()) {
  requireEnv('DATABASE_URL');
}

describeOtpInfrastructure('PhoneOtpService PostgreSQL integration', () => {
  const prisma = new PrismaService();
  const audit = new AuditWriter();
  const accountVerification = new AccountVerificationService(prisma, audit);

  const deliveredBodies: string[] = [];

  const smsAdapter: ActivatedSmsProviderAdapter = {
    providerKey: 'integration-sms',
    deliver: async ({ body }) => {
      deliveredBodies.push(body);
      return { acknowledgement: 'ACCEPTED' };
    },
  };

  const smsRegistry = new ContractSmsProviderRegistry(
    {
      enabled: true,
      providerKey: 'integration-sms',
      credentialReference: 'INTEGRATION_ONLY',
      timeoutMs: 5_000,
    },
    smsAdapter,
  );

  const authConfig = {
    value: {
      otpPepper: randomBytes(32),
    },
  };

  const service = new PhoneOtpService(
    prisma,
    audit,
    authConfig as never,
    accountVerification,
    smsRegistry,
  );

  const createdUserIds: string[] = [];
  const createdTenantIds: string[] = [];

  afterAll(async () => {
    await prisma.client.$disconnect();
  });

  async function createPendingSubject() {
    const tenantId = randomUUID();
    const userId = randomUUID();
    const membershipId = randomUUID();
    const tenantSlug = `otp-${randomUUID()}`;
    const email = `${userId}@otp.medsphere.test`;

    createdTenantIds.push(tenantId);
    createdUserIds.push(userId);

    await prisma.client.tenant.create({
      data: {
        id: tenantId,
        name: 'OTP Integration Tenant',
        slug: tenantSlug,
        isActive: true,
      },
    });

    await prisma.client.user.create({
      data: {
        id: userId,
        email,
        passwordHash: 'integration-only-placeholder',
        firstName: 'OTP',
        lastName: 'Subject',
        status: 'PENDING_VERIFICATION',
      },
    });

    await prisma.client.tenantMembership.create({
      data: {
        id: membershipId,
        tenantId,
        userId,
        status: 'PENDING',
      },
    });

    return { tenantId, userId, membershipId, tenantSlug, email };
  }

  it('persists only a hashed challenge, consumes it once, sets phoneVerifiedAt, and preserves remaining activation gates', async () => {
    const subject = await createPendingSubject();

    await service.requestOtp({
      tenantSlug: subject.tenantSlug,
      email: subject.email,
      phone: '+15551234567',
    });

    expect(deliveredBodies).toHaveLength(1);

    const code = deliveredBodies[0]?.match(/\b(\d{6})\b/)?.[1];
    expect(code).toMatch(/^\d{6}$/);

    const beforeVerify = await prisma.client.phoneOtpChallenge.findUniqueOrThrow({
      where: {
        tenantId_userId: {
          tenantId: subject.tenantId,
          userId: subject.userId,
        },
      },
    });

    expect(beforeVerify.codeHash).toMatch(/^[a-f0-9]{64}$/);
    expect(beforeVerify.codeHash).not.toBe(code);
    expect(JSON.stringify(beforeVerify)).not.toContain(code);
    expect(beforeVerify.consumedAt).toBeNull();

    const result = await service.verifyOtp({
      tenantSlug: subject.tenantSlug,
      email: subject.email,
      code: code!,
    });

    expect(result.replayed).toBe(false);
    expect(result.activated).toBe(false);

    const challenge = await prisma.client.phoneOtpChallenge.findUniqueOrThrow({
      where: {
        tenantId_userId: {
          tenantId: subject.tenantId,
          userId: subject.userId,
        },
      },
    });

    expect(challenge.consumedAt).not.toBeNull();

    const user = await prisma.client.user.findUniqueOrThrow({
      where: { id: subject.userId },
    });

    const membership = await prisma.client.tenantMembership.findUniqueOrThrow({
      where: { id: subject.membershipId },
    });

    expect(user.phoneVerifiedAt).not.toBeNull();
    expect(user.status).toBe('PENDING_VERIFICATION');
    expect(membership.status).toBe('PENDING');

    const replay = await service.verifyOtp({
      tenantSlug: subject.tenantSlug,
      email: subject.email,
      code: code!,
    });

    expect(replay.replayed).toBe(true);

    const auditEvents = await prisma.client.auditEvent.findMany({
      where: {
        tenantId: subject.tenantId,
        resourceId: subject.userId,
      },
      select: { metadata: true },
    });

    const serializedAudit = JSON.stringify(auditEvents);
    expect(serializedAudit).not.toContain(code);
    expect(serializedAudit).not.toContain('+15551234567');
  });
});
