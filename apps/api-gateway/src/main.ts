import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from '@medsphere/common';
import { createValidationPipe } from '@medsphere/validation';
import { createServiceLogger } from '@medsphere/logger';

async function bootstrap(): Promise<void> {
  const logger = createServiceLogger('api-gateway');
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalPipes(createValidationPipe());

  const port = process.env.PORT || 3000;
  await app.listen(port);
  logger.info(`api-gateway listening on port ${port}`);
}

bootstrap();
