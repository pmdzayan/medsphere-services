import { NestFactory } from '@nestjs/core';
import { createServiceLogger } from '@medsphere/logger';
import { AppModule } from './app.module';
import { parseAvailabilityRequestExpiryEnvironment } from './inventory/availability-request-expiry.service';
import { executeAvailabilityRequestExpiryWorker } from './inventory/availability-request-expiry.runner';
import { AvailabilityRequestExpiryService } from './inventory/availability-request-expiry.service';

async function bootstrap(): Promise<void> {
  const logger = createServiceLogger('availability-request-expiry-worker');
  let application: Awaited<ReturnType<typeof NestFactory.createApplicationContext>> | undefined;
  try {
    const config = parseAvailabilityRequestExpiryEnvironment(process.env);
    application = await NestFactory.createApplicationContext(AppModule, { bufferLogs: true });
    const service = application.get(AvailabilityRequestExpiryService);
    process.exitCode = await executeAvailabilityRequestExpiryWorker(service, config, logger);
  } catch {
    logger.error('Availability request expiry worker bootstrap failed', undefined, {
      category: 'unexpected',
    });
    process.exitCode = 1;
  } finally {
    await application?.close();
  }
}

void bootstrap();
