import { randomUUID } from 'node:crypto';
import {
  appendOutboxEvent,
  claimOutboxEvents,
  consumeOutboxEventOnce,
  markOutboxDelivered,
} from '@medsphere/database';
import {
  isInfrastructureTestEnabled,
  requireEnv,
} from './auth/testing/infrastructure-test-gate';
import { PrismaService } from './prisma/prisma.service';

const infrastructure = isInfrastructureTestEnabled() ? describe : describe.skip;
if (isInfrastructureTestEnabled()) requireEnv('DATABASE_URL');

infrastructure('G3.21 PostgreSQL transactional event delivery', () => {
  const prisma = new PrismaService();
  const tenantId = randomUUID();
  const otherTenantId = randomUUID();
  const userId = randomUUID();
  const membershipId = randomUUID();

  beforeAll(async () => {
    await prisma.client.tenant.createMany({
      data: [
        { id: tenantId, name: 'G3.21 event tenant', slug: `g321-${tenantId}` },
        { id: otherTenantId, name: 'G3.21 other tenant', slug: `g321-${otherTenantId}` },
      ],
    });
    await prisma.client.user.create({
      data: {
        id: userId,
        email: `${userId}@medsphere.test`,
        passwordHash: 'integration-only-placeholder',
        firstName: 'Event',
        lastName: 'Operator',
      },
    });
    await prisma.client.tenantMembership.create({
      data: { id: membershipId, tenantId, userId, status: 'ACTIVE', joinedAt: new Date() },
    });
  });

  afterAll(async () => prisma.client.$disconnect());

  it('enforces tenant attribution and immutable envelope evidence', async () => {
    const eventId = randomUUID();
    await prisma.client.$transaction(async (transaction) => {
      await appendOutboxEvent(transaction, tenantEvent(eventId));
    });
    await expect(
      prisma.client.outboxEvent.update({
        where: { id: eventId },
        data: { payload: { changed: true } },
      }),
    ).rejects.toThrow(/envelope is immutable/);
    await expect(prisma.client.outboxEvent.delete({ where: { id: eventId } })).rejects.toThrow(
      /cannot be deleted/,
    );

    await expect(
      prisma.client.$transaction(async (transaction) => {
        await appendOutboxEvent(transaction, {
          ...tenantEvent(randomUUID()),
          actor: {
            actorType: 'TENANT_USER',
            tenantId: otherTenantId,
            membershipId,
            userId,
          },
        });
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
  });

  it('leases one event once across overlapping relay claims and rejects a lost lease', async () => {
    const eventId = randomUUID();
    await appendOutboxEvent(prisma.client, tenantEvent(eventId));
    const now = new Date();
    const [left, right] = await Promise.all([
      claimOutboxEvents(prisma.client, { limit: 100, now, leaseMs: 30_000 }),
      claimOutboxEvents(prisma.client, { limit: 100, now, leaseMs: 30_000 }),
    ]);
    const claimed = [...left, ...right].filter((candidate) => candidate.eventId === eventId);
    expect(claimed).toHaveLength(1);
    expect(claimed[0]).toMatchObject({
      tenantId,
      actorMembershipId: membershipId,
      actorUserId: userId,
      attemptCount: 1,
    });

    await expect(
      markOutboxDelivered(
        prisma.client,
        { eventId, lockToken: randomUUID() },
        new Date(),
      ),
    ).rejects.toThrow('Outbox delivery lease was lost');
    await markOutboxDelivered(prisma.client, claimed[0]!, new Date());
    await expect(
      prisma.client.outboxEvent.findUniqueOrThrow({ where: { id: eventId } }),
    ).resolves.toMatchObject({ status: 'DELIVERED', attemptCount: 1 });
  });

  it('runs a consumer effect once under duplicate concurrent delivery', async () => {
    const eventId = randomUUID();
    await appendOutboxEvent(prisma.client, tenantEvent(eventId));
    const before = await prisma.client.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    const consume = () =>
      consumeOutboxEventOnce(
        prisma.client,
        { tenantId, eventId, consumerName: 'g321-test-projection' },
        async (transaction) =>
          transaction.tenant.update({
            where: { id: tenantId },
            data: { version: { increment: 1 } },
            select: { version: true },
          }),
      );
    const results = await Promise.all([consume(), consume()]);
    expect(results.filter(({ processed }) => processed)).toHaveLength(1);
    expect(results.filter(({ processed }) => !processed)).toHaveLength(1);
    await expect(
      prisma.client.tenant.findUniqueOrThrow({ where: { id: tenantId } }),
    ).resolves.toMatchObject({ version: before.version + 1 });
    await expect(
      prisma.client.eventInboxReceipt.count({
        where: { consumerName: 'g321-test-projection', eventId },
      }),
    ).resolves.toBe(1);
  });

  function tenantEvent(eventId: string) {
    return {
      eventId,
      eventType: 'inventory.batch.quarantined',
      eventVersion: 1,
      aggregateType: 'Batch',
      aggregateId: randomUUID(),
      occurredAt: new Date().toISOString(),
      actor: { actorType: 'TENANT_USER' as const, tenantId, membershipId, userId },
      correlationId: randomUUID(),
      payload: { reasonCode: 'QUALITY_SUSPECT' },
    };
  }
});
