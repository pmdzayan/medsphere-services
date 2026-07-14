import { ValidationPipe, ValidationPipeOptions } from '@nestjs/common';

/**
 * One shared validation-pipe configuration so request-body validation
 * behaves identically across every service, per PROJECT_RULES.md #7
 * ("validation at every boundary — no request body trusted without schema
 * validation before it reaches business logic").
 */
export function createValidationPipe(options: ValidationPipeOptions = {}): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    ...options,
  });
}
