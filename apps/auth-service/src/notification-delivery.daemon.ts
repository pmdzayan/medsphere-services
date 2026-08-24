import { NestFactory } from '@nestjs/core';
import { createServiceLogger } from '@medsphere/logger';
import { AppModule } from './app.module';
import { parseNotificationWorkerEnvironment } from './notifications/notification-worker.config';
import {
  parseNotificationWorkerPollInterval,
  runNotificationWorkerDaemon,
} from './notifications/notification-worker.daemon';
import { NotificationWorkerService } from './notifications/notification-worker.service';

async function bootstrap(): Promise<void> {
  const logger = createServiceLogger('notification-delivery-daemon');
  const abortController = new AbortController();
  const stop = () => abortController.abort();
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);

  let application: Awaited<ReturnType<typeof NestFactory.createApplicationContext>> | undefined;
  try {
    const config = parseNotificationWorkerEnvironment(process.env);
    const pollIntervalMs = parseNotificationWorkerPollInterval(process.env);
    application = await NestFactory.createApplicationContext(AppModule, { bufferLogs: true });
    await runNotificationWorkerDaemon(
      application.get(NotificationWorkerService),
      config,
      pollIntervalMs,
      logger,
      abortController.signal,
    );
  } catch {
    logger.error('Notification delivery daemon bootstrap failed', undefined, {
      category: 'unexpected',
    });
    process.exitCode = 1;
  } finally {
    process.removeListener('SIGTERM', stop);
    process.removeListener('SIGINT', stop);
    await application?.close();
  }
}

void bootstrap();
