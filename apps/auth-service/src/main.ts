import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { createServiceLogger } from '@medsphere/logger';
import {
  appMetrics,
  MetricsExportConfigError,
  OtlpMetricsExporter,
  parseMetricsExportConfig,
} from '@medsphere/common';
import { configureAuthApplication } from './app.bootstrap';
import { assertAuthProductionRuntimePolicy } from './auth-production-runtime';

async function bootstrap(): Promise<void> {
  assertAuthProductionRuntimePolicy();

  const logger = createServiceLogger('auth-service');

  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  configureAuthApplication(app, logger);

  // Metrics export is optional and must never prevent the service from
  // starting: a malformed export configuration disables export only,
  // logged once, while /metrics scraping (wired via MetricsModule) and
  // the rest of the application remain fully available either way.
  try {
    const exportConfig = parseMetricsExportConfig(process.env, { serviceName: 'auth-service' });
    if (exportConfig.enabled) {
      const exporter = new OtlpMetricsExporter(exportConfig, appMetrics, fetch, logger);
      exporter.start();
    }
  } catch (error) {
    if (error instanceof MetricsExportConfigError) {
      logger.warn('Metrics export disabled: invalid configuration', {
        event: 'metrics_export_config_invalid',
      });
    } else {
      throw error;
    }
  }

  const port = Number(process.env.PORT) || 3000;

  await app.listen(port);

  logger.log(`Auth service listening on port ${port}`);
}

bootstrap();
