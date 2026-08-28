import type { MetricsRegistry } from './metrics-registry';

/**
 * Bounded, fail-safe OTLP/HTTP+JSON metrics exporter. Disabled by
 * default; explicit opt-in only. A monitoring backend outage must never
 * take MedSphere down, so every failure mode here is swallowed, counted,
 * and rate-limit-logged -- never thrown, never retried in a tight loop,
 * never able to recurse back through this same telemetry pipeline.
 *
 * This intentionally does not depend on the OpenTelemetry SDK/exporter
 * packages -- see metrics-registry.ts's file header for the same
 * dependency-minimalism rationale. The payload shape is OTLP-metrics-
 * model-shaped (matches MetricsRegistry.toOtlpJsonSnapshot), not a
 * certified implementation of the full OTLP protobuf wire protocol.
 */

export const DEFAULT_METRICS_EXPORT_TIMEOUT_MS = 5_000;
export const MIN_METRICS_EXPORT_TIMEOUT_MS = 250;
export const MAX_METRICS_EXPORT_TIMEOUT_MS = 10_000;
export const DEFAULT_METRICS_EXPORT_INTERVAL_MS = 60_000;
export const MIN_METRICS_EXPORT_INTERVAL_MS = 5_000;

/** Only log a repeating failure this often, to prevent a log storm. */
const FAILURE_LOG_THROTTLE_COUNT = 10;

export interface MetricsExportConfig {
  readonly enabled: boolean;
  readonly endpoint?: string;
  readonly serviceName: string;
  readonly environment: string;
  readonly timeoutMs: number;
  readonly intervalMs: number;
  /** Resolved header value (e.g. an OTLP collector auth token). Never logged. */
  readonly authorizationHeaderValue?: string;
}

export class MetricsExportConfigError extends Error {}

/**
 * Fails closed (throws) on any malformed configuration rather than
 * silently falling back to a default that might be unsafe -- the same
 * fail-fast philosophy `@medsphere/config`'s `loadEnv` already uses.
 * Callers are expected to catch this at bootstrap and refuse to start
 * telemetry export (not the whole application) rather than guess.
 */
export function parseMetricsExportConfig(
  environment: Readonly<Record<string, string | undefined>>,
  defaults: { serviceName: string },
): MetricsExportConfig {
  const enabledValue = environment.TELEMETRY_METRICS_EXPORT_ENABLED;
  if (enabledValue !== undefined && enabledValue !== 'true' && enabledValue !== 'false') {
    throw new MetricsExportConfigError(
      'TELEMETRY_METRICS_EXPORT_ENABLED must be "true" or "false"',
    );
  }
  const enabled = enabledValue === 'true';
  const serviceName = environment.TELEMETRY_SERVICE_NAME?.trim() || defaults.serviceName;
  const environmentName = environment.NODE_ENV?.trim() || 'development';

  const timeoutRaw = environment.TELEMETRY_METRICS_EXPORT_TIMEOUT_MS;
  const timeoutMs =
    timeoutRaw === undefined ? DEFAULT_METRICS_EXPORT_TIMEOUT_MS : Number(timeoutRaw);
  if (
    !Number.isInteger(timeoutMs) ||
    timeoutMs < MIN_METRICS_EXPORT_TIMEOUT_MS ||
    timeoutMs > MAX_METRICS_EXPORT_TIMEOUT_MS
  ) {
    throw new MetricsExportConfigError('TELEMETRY_METRICS_EXPORT_TIMEOUT_MS is out of bounds');
  }

  const intervalRaw = environment.TELEMETRY_METRICS_EXPORT_INTERVAL_MS;
  const intervalMs =
    intervalRaw === undefined ? DEFAULT_METRICS_EXPORT_INTERVAL_MS : Number(intervalRaw);
  if (!Number.isInteger(intervalMs) || intervalMs < MIN_METRICS_EXPORT_INTERVAL_MS) {
    throw new MetricsExportConfigError('TELEMETRY_METRICS_EXPORT_INTERVAL_MS is out of bounds');
  }

  if (!enabled) {
    if (environment.TELEMETRY_METRICS_EXPORT_ENDPOINT) {
      throw new MetricsExportConfigError(
        'TELEMETRY_METRICS_EXPORT_ENDPOINT is set but export is disabled -- enable export explicitly or remove the endpoint',
      );
    }
    return { enabled: false, serviceName, environment: environmentName, timeoutMs, intervalMs };
  }

  const endpoint = environment.TELEMETRY_METRICS_EXPORT_ENDPOINT?.trim();
  if (!endpoint) {
    throw new MetricsExportConfigError(
      'TELEMETRY_METRICS_EXPORT_ENDPOINT is required when export is enabled',
    );
  }
  let parsedEndpoint: URL;
  try {
    parsedEndpoint = new URL(endpoint);
  } catch {
    throw new MetricsExportConfigError('TELEMETRY_METRICS_EXPORT_ENDPOINT is not a valid URL');
  }
  if (parsedEndpoint.protocol !== 'https:') {
    // Fail closed rather than silently allow an insecure collector
    // endpoint -- there is no legitimate reason to export telemetry over
    // plain HTTP, in any environment.
    throw new MetricsExportConfigError('TELEMETRY_METRICS_EXPORT_ENDPOINT must use HTTPS');
  }

  const headerReference = environment.TELEMETRY_METRICS_EXPORT_HEADER_CREDENTIAL_REFERENCE?.trim();
  let authorizationHeaderValue: string | undefined;
  if (headerReference) {
    const resolved = environment[headerReference];
    if (!resolved) {
      throw new MetricsExportConfigError(
        `TELEMETRY_METRICS_EXPORT_HEADER_CREDENTIAL_REFERENCE names "${headerReference}", but that variable is not set`,
      );
    }
    authorizationHeaderValue = resolved;
  }

  return {
    enabled: true,
    endpoint,
    serviceName,
    environment: environmentName,
    timeoutMs,
    intervalMs,
    authorizationHeaderValue,
  };
}

export interface ExportFailureLogger {
  warn(message: string, meta?: Record<string, unknown>): void;
}

export type ExportOutcome = 'disabled' | 'success' | 'failure';

export class OtlpMetricsExporter {
  private consecutiveFailures = 0;
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly config: MetricsExportConfig,
    private readonly registry: MetricsRegistry,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly logger?: ExportFailureLogger,
  ) {}

  /**
   * Exports one snapshot. Never throws: a monitoring backend outage must
   * never fail the caller. Every failure increments a bounded,
   * privacy-safe counter and is logged only every Nth consecutive
   * failure, never per-attempt, so a persistent outage cannot create a
   * log storm.
   */
  async exportOnce(): Promise<ExportOutcome> {
    if (!this.config.enabled || !this.config.endpoint) {
      return 'disabled';
    }

    try {
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (this.config.authorizationHeaderValue) {
        headers.authorization = this.config.authorizationHeaderValue;
      }
      const response = await this.fetchImpl(this.config.endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(
          this.registry.toOtlpJsonSnapshot(this.config.serviceName, this.config.environment),
        ),
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });
      if (!response.ok) {
        throw new Error(`exporter endpoint responded with status ${response.status}`);
      }
      this.consecutiveFailures = 0;
      return 'success';
    } catch {
      this.consecutiveFailures += 1;
      this.registry.exporterFailuresTotal.increment();
      if (
        this.consecutiveFailures === 1 ||
        this.consecutiveFailures % FAILURE_LOG_THROTTLE_COUNT === 0
      ) {
        // Never include the endpoint URL, headers, or payload content --
        // only a bounded, privacy-safe occurrence count.
        this.logger?.warn('Metrics export failed', {
          event: 'metrics_export_failed',
          consecutiveFailures: this.consecutiveFailures,
        });
      }
      return 'failure';
    }
  }

  /** Starts a periodic export loop. The timer is unref'd so it never keeps a process alive by itself. */
  start(): void {
    if (this.timer || !this.config.enabled) {
      return;
    }
    this.timer = setInterval(() => {
      void this.exportOnce();
    }, this.config.intervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }
}
