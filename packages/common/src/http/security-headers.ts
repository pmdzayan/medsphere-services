import type { INestApplication } from '@nestjs/common';
import helmet from 'helmet';

export interface HttpSecurityHeaderOptions {
  readonly interactiveDocumentation?: boolean;
}

export function configureHttpSecurityHeaders(
  app: INestApplication,
  options: HttpSecurityHeaderOptions = {},
): void {
  app.use(options.interactiveDocumentation ? helmet({ contentSecurityPolicy: false }) : helmet());
}
