import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { configureHttpSecurityHeaders, GlobalExceptionFilter } from '@medsphere/common';
import { createValidationPipe } from '@medsphere/validation';

/**
 * Applies the HTTP boundary shared by production bootstrap and API tests.
 * Keeping this in one place prevents tests from proving a different filter,
 * validation, or OpenAPI configuration than the running service uses.
 */
export function configureAuthApplication(app: INestApplication): void {
  configureHttpSecurityHeaders(app, {
    interactiveDocumentation: process.env.ENABLE_SWAGGER === 'true',
  });
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalPipes(createValidationPipe());

  if (process.env.ENABLE_SWAGGER === 'true') {
    const openApiConfig = new DocumentBuilder()
      .setTitle('MedSphere Platform API')
      .setDescription(
        'Accepted identity, authorization, audit, provider-scope, and bounded inventory endpoints',
      )
      .setVersion('0.5.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
      .build();
    const openApiDocument = SwaggerModule.createDocument(app, openApiConfig);
    SwaggerModule.setup('docs', app, openApiDocument, {
      jsonDocumentUrl: 'docs/openapi.json',
    });
  }
}
