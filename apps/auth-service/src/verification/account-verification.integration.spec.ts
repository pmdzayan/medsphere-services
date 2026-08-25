import { randomUUID } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import { AuditWriter } from '../audit/audit-writer.service';
import {
  isInfrastructureTestEnabled,
  requireEnv,
} from '../auth/testing/infrastructure-test-gate';
import { PrismaService } from '../prisma/prisma.service';
import { UsersRepository } from '../users/users.repository';
import { AccountVerificationService } from './account-verification.service';
import type { AccountVerificationMethod } from './verification.types';

const describeVerificationInfra = isInfrastructureTestEnabled() ? describe : describe.skip;

if (isInfrastructureTestEnabled()) {
  requireEnv('DATABASE_URL');
}

describeVerificationInfra('AccountVerificationService PostgreSQL integration', () => {
  const prisma = new PrismaService();
  const service = new AccountVerificationService(prisma, new AuditWriter());
  const users = new UsersRepository(prisma);
  const originalTestProviderFlag = process.env.ENABLE_TEST_VERIFICATION_PROVIDER;

  beforeAll(() => {
    process.env.ENABLE_TEST_VERIFICATION_PROVIDER = 'true';
  });

  afterAll(async () => {
    if (originalTestProviderFlag === undefined) {
      delete process.env.ENABLE_TEST_VERIFICATION_PROVIDER;
    } else {
      process.env.ENABLE_TEST_VERIFICATION_PROVIDER = originalTestProviderFlag;
    }
    await prisma.client.$disconnect();
  });

  async function createPendingSubject() {
    const tenantId = randomUUID();
    const otherTenantId = randomUUID();
    const userId = randomUUID();
    const membershipId = randomUUID();
    const otherMembershipId = randomUUID();
    const tenantSlug = `verification-${tenantId}`;
    const email = `${userId}@verification.medsphere.test`;

    await prisma.client.tenant.createMany({
      data: [
        { id: tenantId, name: 'Verification Tenant', slug: tenantSlug, isActive: true },
        {
          id: otherTenantId,
          name: 'Other Verification Tenant',
          slug: `verification-other-${otherTenantId}`,
          isActive: true,
        },
      ],
    });
    await prisma.client.user.create({
      data: {
        id: userId,
        email,
        passwordHash: 'integration-only-placeholder',
        firstName: 'Verification',
        lastName: 'Subject',
        status: 'PENDING_VERIFICATION',
      },
    });
    await prisma.client.tenantMembership.createMany({
      data: [
        { id: membershipId, tenantId, userId, status: 'PENDING' },
        { id: otherMembershipId, tenantId: otherTenantId, userId, status: 'PENDING' },
      ],
    });

    return {
      tenantId,
      otherTenantId,
      userId,
      membershipId,
      otherMembershipId,
      tenantSlug,
      email,
    };
  }

  async function complete(
    subject: Awaited<ReturnType<typeof createPendingSubject>>,
    method: AccountVerificationMethod,
    options: { approved?: boolean; ageVerified18Plus?: boolean; key?: string } = {},
  ) {
    const idempotencyKey = options.key ?? `${method.toLowerCase()}-${randomUUID()}`;
    return service.completeMockVerification({
      tenantSlug: subject.tenantSlug,
      email: subject.email,
      method,
      idempotencyKey,
      approved: options.approved ?? true,
      ageVerified18Plus: options.ageVerified18Plus,
      providerReference: `opaque-${idempotencyKey}`,
    });
  }

  async function completeAdultPolicy(subject: Awaited<ReturnType<typeof createPendingSubject>>) {
    await complete(subject, 'PHONE');
    await complete(subject, 'IDENTITY');
    return complete(subject, 'AGE', { ageVerified18Plus: true });
  }

  it('keeps an unverified account non-active and outside the login identity query', async () => {
    const subject = await createPendingSubject();

    await expect(users.findLoginIdentity(subject.tenantSlug, subject.email)).resolves.toBeNull();
    const user = await prisma.client.user.findUniqueOrThrow({ where: { id: subject.userId } });
    const membership = await prisma.client.tenantMembership.findUniqueOrThrow({
      where: { id: subject.membershipId },
    });
    expect(user.status).toBe('PENDING_VERIFICATION');
    expect(membership.status).toBe('PENDING');
  });

  it('does not activate with phone verification alone or identity plus age without phone', async () => {
    const phoneOnly = await createPendingSubject();
    const phoneResult = await complete(phoneOnly, 'PHONE');
    expect(phoneResult.activated).toBe(false);
    await expect(
      users.findLoginIdentity(phoneOnly.tenantSlug, phoneOnly.email),
    ).resolves.toBeNull();

    const noPhone = await createPendingSubject();
    await complete(noPhone, 'IDENTITY');
    const ageResult = await complete(noPhone, 'AGE', { ageVerified18Plus: true });
    expect(ageResult.activated).toBe(false);
    await expect(users.findLoginIdentity(noPhone.tenantSlug, noPhone.email)).resolves.toBeNull();
  });

  it('atomically activates a verified adult and only the intended membership', async () => {
    const subject = await createPendingSubject();
    const result = await completeAdultPolicy(subject);

    expect(result).toMatchObject({
      userId: subject.userId,
      membershipId: subject.membershipId,
      userStatus: 'ACTIVE',
      membershipStatus: 'ACTIVE',
      activated: true,
      replayed: false,
    });
    await expect(users.findLoginIdentity(subject.tenantSlug, subject.email)).resolves.toMatchObject({
      user: { id: subject.userId, email: subject.email },
      membershipId: subject.membershipId,
      tenantId: subject.tenantId,
    });

    const otherMembership = await prisma.client.tenantMembership.findUniqueOrThrow({
      where: { id: subject.otherMembershipId },
    });
    expect(otherMembership.status).toBe('PENDING');
  });

  it('keeps an under-18 result non-active and unable to satisfy login identity', async () => {
    const subject = await createPendingSubject();
    await complete(subject, 'PHONE');
    await complete(subject, 'IDENTITY');
    const result = await complete(subject, 'AGE', { ageVerified18Plus: false });

    expect(result.activated).toBe(false);
    const user = await prisma.client.user.findUniqueOrThrow({ where: { id: subject.userId } });
    expect(user).toMatchObject({
      status: 'PENDING_VERIFICATION',
      ageVerificationStatus: 'APPROVED',
      ageVerified18Plus: false,
    });
    await expect(users.findLoginIdentity(subject.tenantSlug, subject.email)).resolves.toBeNull();
  });

  it('is replay-safe and rejects conflicting idempotency-key reuse', async () => {
    const subject = await createPendingSubject();
    const key = `phone-${randomUUID()}`;
    const first = await complete(subject, 'PHONE', { key });
    const replay = await complete(subject, 'PHONE', { key });

    expect(first.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(
      await prisma.client.accountVerificationAttempt.count({
        where: { userId: subject.userId, method: 'PHONE', idempotencyKey: key },
      }),
    ).toBe(1);

    await expect(complete(subject, 'PHONE', { key, approved: false })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('does not partially activate after a rejected verification and keeps audit metadata minimized', async () => {
    const subject = await createPendingSubject();
    await complete(subject, 'PHONE');
    await complete(subject, 'IDENTITY', { approved: false });
    await complete(subject, 'AGE', { ageVerified18Plus: true });

    const user = await prisma.client.user.findUniqueOrThrow({ where: { id: subject.userId } });
    const membership = await prisma.client.tenantMembership.findUniqueOrThrow({
      where: { id: subject.membershipId },
    });
    expect(user.status).toBe('PENDING_VERIFICATION');
    expect(user.identityVerificationStatus).toBe('REJECTED');
    expect(membership.status).toBe('PENDING');

    const attempts = await prisma.client.accountVerificationAttempt.findMany({
      where: { userId: subject.userId },
    });
    expect(attempts).toHaveLength(3);
    for (const attempt of attempts) {
      const record = attempt as unknown as Record<string, unknown>;
      expect(record).not.toHaveProperty('aadhaarNumber');
      expect(record).not.toHaveProperty('otp');
      expect(record).not.toHaveProperty('biometric');
      expect(record).not.toHaveProperty('dateOfBirth');
    }

    const auditEvents = await prisma.client.auditEvent.findMany({
      where: { tenantId: subject.tenantId, resourceId: subject.userId },
      select: { metadata: true },
    });
    expect(auditEvents.length).toBeGreaterThanOrEqual(3);
    for (const event of auditEvents) {
      const serialized = JSON.stringify(event.metadata).toLowerCase();
      expect(serialized).not.toContain(subject.email.toLowerCase());
      expect(serialized).not.toContain('aadhaar');
      expect(serialized).not.toContain('otp');
      expect(serialized).not.toContain('biometric');
    }
  });
});
