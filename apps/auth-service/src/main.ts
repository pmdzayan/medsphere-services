import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { createServiceLogger } from '@medsphere/logger';
import { configureAuthApplication } from './app.bootstrap';

async function bootstrap(): Promise<void> {
  const logger = createServiceLogger('auth-service');

  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  configureAuthApplication(app);

  const port = Number(process.env.PORT) || 3000;

  await app.listen(port);

  logger.log(`Auth service listening on port ${port}`);
}

bootstrap();
