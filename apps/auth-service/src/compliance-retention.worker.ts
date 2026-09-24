import { NestFactory } from '@nestjs/core';
import { createServiceLogger } from '@medsphere/logger';
import { AppModule } from './app.module';
import { parseComplianceRetentionEnvironment } from './compliance/compliance-retention.config';
import { executeComplianceRetentionWorker } from './compliance/compliance-retention.runner';
import { ComplianceRetentionService } from './compliance/compliance-retention.service';

async function bootstrap(): Promise<void> {
  const logger = createServiceLogger('compliance-retention-worker');
  let application: Awaited<ReturnType<typeof NestFactory.createApplicationContext>> | undefined;
  try {
    const config = parseComplianceRetentionEnvironment(process.env);
    application = await NestFactory.createApplicationContext(AppModule, { bufferLogs: true });
    const service = application.get(ComplianceRetentionService);
    process.exitCode = await executeComplianceRetentionWorker(service, config, logger);
  } catch {
    logger.error('Compliance retention worker bootstrap failed', undefined, {
      category: 'unexpected',
    });
    process.exitCode = 1;
  } finally {
    await application?.close();
  }
}

void bootstrap();
