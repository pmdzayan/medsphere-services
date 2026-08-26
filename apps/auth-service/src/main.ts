import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { createServiceLogger } from '@medsphere/logger';
import { configureAuthApplication } from './app.bootstrap';
import { assertAuthProductionRuntimePolicy } from './auth-production-runtime';

async function bootstrap(): Promise<void> {
  assertAuthProductionRuntimePolicy();

  const logger = createServiceLogger('auth-service');

  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  configureAuthApplication(app, logger);

  const port = Number(process.env.PORT) || 3000;

  await app.listen(port);

  logger.log(`Auth service listening on port ${port}`);
}

bootstrap();
