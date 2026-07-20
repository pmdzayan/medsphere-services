import { Controller, Get, HttpCode } from '@nestjs/common';
import { PublicEndpoint } from '../auth/public-endpoint.decorator';

/**
 * Shared across every service so liveness/readiness semantics — and the
 * exact response shape the Docker/Kubernetes healthcheck expects — never
 * drift service-to-service. See scripts/healthcheck.js at the repo root for
 * the container-level check that calls these endpoints.
 */
@Controller('health')
@PublicEndpoint()
export class HealthController {
  @Get('live')
  @HttpCode(200)
  live() {
    // Process is up and able to handle requests.
    return { status: 'ok' };
  }

  @Get('ready')
  @HttpCode(200)
  ready() {
    // Intentionally mirrors `live` for now. Once a service wires a real
    // database/Kafka client, extend this to verify those dependencies before
    // reporting ready — faking a dependency check here would be worse than
    // not having one, since it would hide real outages.
    return { status: 'ok' };
  }
}
