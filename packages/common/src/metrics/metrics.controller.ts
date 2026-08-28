import { Controller, Get, Header, HttpCode } from '@nestjs/common';
import { PublicEndpoint } from '../auth/public-endpoint.decorator';
import { appMetrics } from './metrics-registry';

/**
 * Exposes the shared metrics singleton in Prometheus text-exposition
 * format for scraping. Contains only the bounded, low-cardinality
 * counters/histograms recorded through MetricsRegistry -- there is no
 * code path in this registry that could carry a raw URL, tenant ID,
 * phone number, or other sensitive value (see metrics-registry.ts).
 *
 * Marked public (matching HealthController's convention) since a scrape
 * endpoint is typically reached only from an internal network/collector,
 * not end users; network-level access control for this route is a
 * deployment concern, not something this endpoint enforces itself -- see
 * docs/operations/v1-observability-runbook.md.
 */
@Controller('metrics')
@PublicEndpoint()
export class MetricsController {
  @Get()
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @Header('content-type', 'text/plain; version=0.0.4')
  scrape(): string {
    return appMetrics.renderPrometheusText();
  }
}
