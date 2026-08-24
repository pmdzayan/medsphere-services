import { NestFactory } from '@nestjs/core';
import { createServiceLogger } from '@medsphere/logger';
import { AppModule } from './app.module';
import { parseNotificationWorkerEnvironment } from './notifications/notification-worker.config';
import { executeNotificationWorker } from './notifications/notification-worker.runner';
import { NotificationWorkerService } from './notifications/notification-worker.service';

async function bootstrap(): Promise<void> {
  const logger = createServiceLogger('notification-delivery-worker');
  let application: Awaited<ReturnType<typeof NestFactory.createApplicationContext>> | undefined;
  try {
    const config = parseNotificationWorkerEnvironment(process.env);
    application = await NestFactory.createApplicationContext(AppModule, { bufferLogs: true });
    process.exitCode = await executeNotificationWorker(
      application.get(NotificationWorkerService),
      config,
      logger,
    );
  } catch {
    logger.error('Notification delivery worker bootstrap failed', undefined, {
      category: 'unexpected',
    });
    process.exitCode = 1;
  } finally {
    await application?.close();
  }
}

void bootstrap();
