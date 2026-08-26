import {
  Controller,
  Get,
  HttpCode,
  Inject,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PublicEndpoint } from '../auth/public-endpoint.decorator';

export const HEALTH_READINESS_CHECK = Symbol('HEALTH_READINESS_CHECK');

export interface HealthReadinessCheck {
  check(): Promise<void>;
}

/**
 * Shared across every service so liveness/readiness semantics — and the
 * exact response shape the Docker/Kubernetes healthcheck expects — never
 * drift service-to-service. See scripts/healthcheck.js at the repo root for
 * the container-level check that calls these endpoints.
 */
@Controller('health')
@PublicEndpoint()
export class HealthController {
  constructor(
    @Optional()
    @Inject(HEALTH_READINESS_CHECK)
    private readonly readinessCheck?: HealthReadinessCheck,
  ) {}

  @Get('live')
  @HttpCode(200)
  live() {
    // Process is up and able to handle requests.
    return { status: 'ok' };
  }

  @Get('ready')
  @HttpCode(200)
  async ready() {
    try {
      await this.readinessCheck?.check();
      return { status: 'ok' };
    } catch {
      // Readiness responses must never expose dependency URLs, credentials,
      // provider details, or underlying exception messages.
      throw new ServiceUnavailableException({ status: 'unavailable' });
    }
  }
}
