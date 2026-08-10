import { NestFactory } from '@nestjs/core';
import { createServiceLogger } from '@medsphere/logger';
import { AppModule } from './app.module';
import { parseBatchExpiryEnvironment } from './inventory/batch-expiry.config';
import { executeBatchExpiryWorker } from './inventory/batch-expiry.runner';
import { BatchExpiryService } from './inventory/batch-expiry.service';

async function bootstrap(): Promise<void> {
  const logger = createServiceLogger('batch-expiry-worker');
  let application: Awaited<ReturnType<typeof NestFactory.createApplicationContext>> | undefined;
  try {
    const config = parseBatchExpiryEnvironment(process.env);
    application = await NestFactory.createApplicationContext(AppModule, { bufferLogs: true });
    process.exitCode = await executeBatchExpiryWorker(
      application.get(BatchExpiryService),
      config,
      logger,
    );
  } catch {
    logger.error('Batch expiry worker bootstrap failed', undefined, { category: 'unexpected' });
    process.exitCode = 1;
  } finally {
    await application?.close();
  }
}

void bootstrap();
