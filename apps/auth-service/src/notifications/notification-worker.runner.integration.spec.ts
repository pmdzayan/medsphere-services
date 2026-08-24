import { randomUUID } from 'node:crypto';
import { appendOutboxEvent, enqueueNotificationDelivery } from '@medsphere/database';
import { isInfrastructureTestEnabled, requireEnv } from '../auth/testing/infrastructure-test-gate';
import { PrismaService } from '../prisma/prisma.service';
import { LoggingNotificationDeliveryObserver } from './logging-notification-delivery.observer';
import { createNotificationProviderRegistry } from './notification-provider-registry.factory';
import { NotificationWorkerService } from './notification-worker.service';
import { ReservationNotificationComposerService } from './reservation-notification-composer.service';
import { ReservationRecipientResolverService } from './reservation-recipient-resolver.service';

const infrastructure = isInfrastructureTestEnabled() ? describe : describe.skip;
if (isInfrastructureTestEnabled()) requireEnv('DATABASE_URL');

infrastructure(
  'notification-worker.runner fail-closed behavior (real PostgreSQL, no provider configured)',
  () => {
    const prisma = new PrismaService();
    const tenantId = randomUUID();
    const userId = randomUUID();
    const membershipId = randomUUID();

    beforeAll(async () => {
      await prisma.client.tenant.create({
        data: {
          id: tenantId,
          name: 'Notification worker fail-closed tenant',
          slug: `nwfc-${tenantId}`,
        },
      });
      await prisma.client.user.create({
        data: {
          id: userId,
          email: `${userId}@medsphere.test`,
          passwordHash: 'integration-only-placeholder',
          firstName: 'Notification',
          lastName: 'Recipient',
          status: 'ACTIVE',
        },
      });
      await prisma.client.tenantMembership.create({
        data: {
          id: membershipId,
          tenantId,
          userId,
          status: 'ACTIVE',
          joinedAt: new Date(),
        },
      });
    });

    afterAll(async () => prisma.client.$disconnect());

    it('claims a real eligible delivery, attempts it with no provider configured, records failure/dead-letter (never success), and reports it accurately', async () => {
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
      const enqueueResult = await enqueueNotificationDelivery(prisma.client, {
        tenantId,
        sourceEventId: eventId,
        workflowKey: 'notification-worker-fail-closed-test',
        recipientType: 'TENANT_MEMBERSHIP',
        recipientReferenceId: membershipId,
        channel: 'EMAIL',
        templateKey: 'reservation-ready',
        templateVersion: 1,
        variables: { status: 'READY' },
        availableAt: new Date(),
      });
      expect(enqueueResult).toEqual({ enqueued: true });

      const registry = createNotificationProviderRegistry({});

      const service = new NotificationWorkerService(
        prisma,
        new ReservationRecipientResolverService(prisma),
        registry,
        new LoggingNotificationDeliveryObserver(),
        new ReservationNotificationComposerService(),
      );

      const summary = await service.run({
        limit: 10,
        leaseMs: 30_000,
        maximumAttempts: 1,
        now: new Date(),
      });

      expect(summary.claimed).toBe(1);
      expect(summary.delivered).toBe(0);
      expect(summary.failed + summary.deadLettered).toBe(1);

      const persisted = await prisma.client.notificationDelivery.findFirst({
        where: { tenantId, sourceEventId: eventId },
        select: { status: true, attemptCount: true },
      });
      expect(persisted).not.toBeNull();
      expect(persisted?.status).not.toBe('DELIVERED');
      expect(['FAILED', 'DEAD_LETTER']).toContain(persisted?.status);

      const attempt = await prisma.client.notificationDeliveryAttempt.findFirst({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        select: { outcome: true, errorCode: true, providerKey: true },
      });
      expect(attempt).not.toBeNull();
      expect(attempt?.outcome).not.toBe('DELIVERED');
      expect(attempt?.errorCode).toBe('PROVIDER_UNAVAILABLE');
    });
  },
);
