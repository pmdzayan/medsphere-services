import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureHttpSecurityHeaders, GlobalExceptionFilter } from '@medsphere/common';
import { assertUnacceptedPrototypeRuntimeAllowed } from '@medsphere/config';
import { createValidationPipe } from '@medsphere/validation';
import { createServiceLogger } from '@medsphere/logger';

async function bootstrap(): Promise<void> {
  assertUnacceptedPrototypeRuntimeAllowed('reservation-service');

  const logger = createServiceLogger('reservation-service');
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  configureHttpSecurityHeaders(app);
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalPipes(createValidationPipe());

  const port = process.env.PORT || 3000;
  await app.listen(port);
  logger.info(`reservation-service listening on port ${port}`);
}

bootstrap();
