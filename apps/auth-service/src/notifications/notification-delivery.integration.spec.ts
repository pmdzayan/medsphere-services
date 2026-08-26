import { randomUUID } from 'node:crypto';
import {
  appendOutboxEvent,
  claimNotificationDeliveries,
  enqueueNotificationDelivery,
  recordNotificationDelivered,
  recordNotificationFailed,
} from '@medsphere/database';
import { isInfrastructureTestEnabled, requireEnv } from '../auth/testing/infrastructure-test-gate';
import { PrismaService } from '../prisma/prisma.service';

const infrastructure = isInfrastructureTestEnabled() ? describe : describe.skip;
if (isInfrastructureTestEnabled()) requireEnv('DATABASE_URL');

infrastructure('G3.23 PostgreSQL notification delivery foundation', () => {
  const prisma = new PrismaService();
  const tenantId = randomUUID();
  const otherTenantId = randomUUID();
  const userId = randomUUID();
  const membershipId = randomUUID();

  beforeAll(async () => {
    await prisma.client.tenant.createMany({
      data: [
        { id: tenantId, name: 'G3.23 notification tenant', slug: `g323-${tenantId}` },
        { id: otherTenantId, name: 'G3.23 other tenant', slug: `g323-${otherTenantId}` },
      ],
    });
    await prisma.client.user.create({
      data: {
        id: userId,
        email: `${userId}@medsphere.test`,
        passwordHash: 'integration-only-placeholder',
        firstName: 'Notification',
        lastName: 'Operator',
      },
    });
    await prisma.client.tenantMembership.create({
      data: { id: membershipId, tenantId, userId, status: 'ACTIVE', joinedAt: new Date() },
    });
  });

  afterAll(async () => prisma.client.$disconnect());

  it('enqueues idempotently and rejects cross-tenant source events', async () => {
    const eventId = await createSourceEvent();
    const input = deliveryInput(eventId);
    await expect(enqueueNotificationDelivery(prisma.client, input)).resolves.toEqual({
      enqueued: true,
    });
    await expect(enqueueNotificationDelivery(prisma.client, input)).resolves.toEqual({
      enqueued: false,
    });
    await expect(
      enqueueNotificationDelivery(prisma.client, { ...input, tenantId: otherTenantId }),
    ).rejects.toMatchObject({ code: 'P2003' });
  });

  it('scopes notification claims to the requested tenant', async () => {
    const tenantEventId = await createSourceEvent();
    await enqueueNotificationDelivery(prisma.client, deliveryInput(tenantEventId));

    const otherEventId = randomUUID();
    await appendOutboxEvent(prisma.client, {
      eventId: otherEventId,
      eventType: 'inventory.reservation.ready',
      eventVersion: 1,
      aggregateType: 'MedicineReservation',
      aggregateId: randomUUID(),
      occurredAt: new Date().toISOString(),
      actor: {
        actorType: 'SYSTEM',
        tenantId: otherTenantId,
        service: 'notification-delivery.integration',
      },
      payload: { status: 'READY', version: 2 },
    });

    await enqueueNotificationDelivery(prisma.client, {
      ...deliveryInput(otherEventId),
      tenantId: otherTenantId,
    });

    const now = new Date();
    const claimed = await claimNotificationDeliveries(prisma.client, {
      limit: 100,
      now,
      leaseMs: 30_000,
      tenantId,
    });

    expect(claimed.filter((item) => item.sourceEventId === tenantEventId)).toHaveLength(1);
    expect(claimed.some((item) => item.sourceEventId === otherEventId)).toBe(false);
    expect(claimed.every((item) => item.tenantId === tenantId)).toBe(true);
  });

  it('claims once across overlapping workers and rejects a stale outcome lease', async () => {
    const eventId = await createSourceEvent();
    await enqueueNotificationDelivery(prisma.client, deliveryInput(eventId));
    const now = new Date();
    const [left, right] = await Promise.all([
      claimNotificationDeliveries(prisma.client, { limit: 100, now, leaseMs: 30_000 }),
      claimNotificationDeliveries(prisma.client, { limit: 100, now, leaseMs: 30_000 }),
    ]);
    const claimed = [...left, ...right].filter((item) => item.sourceEventId === eventId);
    expect(claimed).toHaveLength(1);
    await expect(
      recordNotificationDelivered(
        prisma.client,
        { ...claimed[0]!, lockToken: randomUUID() },
        { occurredAt: now, providerKey: 'integration-provider' },
      ),
    ).rejects.toThrow('lease was lost');
    await recordNotificationDelivered(prisma.client, claimed[0]!, {
      occurredAt: now,
      providerKey: 'integration-provider',
      providerReferenceHash: 'a'.repeat(64),
    });
    await expect(
      prisma.client.notificationDelivery.findUniqueOrThrow({
        where: { id: claimed[0]!.deliveryId },
        include: { attempts: true },
      }),
    ).resolves.toMatchObject({
      status: 'DELIVERED',
      attemptCount: 1,
      attempts: [
        expect.objectContaining({
          outcome: 'DELIVERED',
          providerKey: 'integration-provider',
          errorCode: null,
        }),
      ],
    });
  });

  it('records bounded failures, dead-letters, and immutable evidence', async () => {
    const eventId = await createSourceEvent();
    await enqueueNotificationDelivery(prisma.client, deliveryInput(eventId));
    const now = new Date();
    const claimed = (
      await claimNotificationDeliveries(prisma.client, { limit: 100, now, leaseMs: 30_000 })
    ).find((item) => item.sourceEventId === eventId)!;
    await expect(
      recordNotificationFailed(prisma.client, claimed, {
        occurredAt: now,
        providerKey: 'integration-provider',
        errorCode: 'PROVIDER_TIMEOUT',
        maximumAttempts: 1,
      }),
    ).resolves.toBe('DEAD_LETTER');
    const stored = await prisma.client.notificationDelivery.findUniqueOrThrow({
      where: { id: claimed.deliveryId },
      include: { attempts: true },
    });
    expect(stored).toMatchObject({ status: 'DEAD_LETTER', lastErrorCode: 'PROVIDER_TIMEOUT' });
    expect(stored.attempts).toHaveLength(1);
    await expect(
      prisma.client.notificationDeliveryAttempt.update({
        where: { id: stored.attempts[0]!.id },
        data: { errorCode: 'CHANGED' },
      }),
    ).rejects.toThrow(/append-only/);
    await expect(
      prisma.client.notificationDelivery.delete({ where: { id: claimed.deliveryId } }),
    ).rejects.toThrow(/durable evidence/);
  });

  async function createSourceEvent(): Promise<string> {
    const eventId = randomUUID();
    await appendOutboxEvent(prisma.client, {
      eventId,
      eventType: 'inventory.reservation.ready',
      eventVersion: 1,
      aggregateType: 'MedicineReservation',
      aggregateId: randomUUID(),
      occurredAt: new Date().toISOString(),
      actor: { actorType: 'TENANT_USER', tenantId, membershipId, userId },
      payload: { status: 'READY', version: 2 },
    });
    return eventId;
  }

  function deliveryInput(sourceEventId: string) {
    return {
      tenantId,
      sourceEventId,
      workflowKey: 'g323-integration-workflow',
      recipientType: 'TENANT_MEMBERSHIP' as const,
      recipientReferenceId: membershipId,
      channel: 'EMAIL' as const,
      templateKey: 'g323-integration-template',
      templateVersion: 1,
      variables: { status: 'READY' },
      availableAt: new Date(),
    };
  }
});
