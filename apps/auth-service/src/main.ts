import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from '@medsphere/common';
import { createValidationPipe } from '@medsphere/validation';
import { createServiceLogger } from '@medsphere/logger';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap(): Promise<void> {
  const logger = createServiceLogger('auth-service');

  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalPipes(createValidationPipe());

  if (process.env.ENABLE_SWAGGER === 'true') {
    const openApiConfig = new DocumentBuilder()
      .setTitle('MedSphere Authentication API')
      .setDescription('Accepted S0.3 authentication and trusted tenant-context endpoints')
      .setVersion('0.3.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
      .build();
    const openApiDocument = SwaggerModule.createDocument(app, openApiConfig);
    SwaggerModule.setup('docs', app, openApiDocument, {
      jsonDocumentUrl: 'docs/openapi.json',
    });
  }

  const port = Number(process.env.PORT) || 3000;

  await app.listen(port);

  logger.log(`Auth service listening on port ${port}`);
}

bootstrap();
