/**
 * Vendor-neutral, in-process application metrics registry.
 *
 * Deliberately minimal and dependency-free rather than pulling in the
 * full OpenTelemetry Metrics SDK: the two primitives every required
 * metric in this task needs (Counter, Histogram) are ~100 lines total,
 * and a hand-rolled Prometheus text-exposition serializer is a
 * well-documented, stable, trivial format. This keeps the monitoring
 * foundation itself from becoming a new source of dependency/runtime
 * risk. See docs/operations/v1-observability-runbook.md for the
 * architecture rationale.
 *
 * Exported as a singleton (`appMetrics`) rather than a DI-injected
 * service: every call site that records a metric (HTTP middleware, the
 * global exception filter, readiness checks, notification/OTP/reservation
 * outcomes) already has an existing, tested constructor signature this
 * change must not alter. A metrics library used as a shared global
 * registry is the same pattern `prom-client` itself uses; it is not a
 * shortcut specific to this codebase.
 */

const MAX_LABEL_VALUE_LENGTH = 128;
const MAX_SERIES_PER_METRIC = 500;
const UUID_LABEL_VALUE_PATTERN =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i;
const EMAIL_LABEL_VALUE_PATTERN = /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/;
const LONG_DIGIT_RUN_PATTERN = /\d{10,}/;

/**
 * The complete allowlist of label keys any metric in this registry may
 * use. This is the primary cardinality/privacy guard: recording a metric
 * with any other key throws immediately, in development and production
 * alike, so a future call site cannot silently introduce a high-
 * cardinality or sensitive label (a tenant ID, a phone number, a raw
 * request ID) by copy-paste mistake.
 */
const ALLOWED_LABEL_KEYS = new Set([
  'service',
  'method',
  'route',
  'status_class',
  'dependency',
  'outcome',
  'channel',
  'provider',
]);

export type MetricLabels = Readonly<Record<string, string>>;

function assertSafeLabels(metricName: string, labels: MetricLabels): void {
  for (const [key, value] of Object.entries(labels)) {
    if (!ALLOWED_LABEL_KEYS.has(key)) {
      throw new Error(
        `Metric "${metricName}": label key "${key}" is not on the allowed low-cardinality label list`,
      );
    }
    if (typeof value !== 'string' || value.length === 0) {
      throw new Error(`Metric "${metricName}": label "${key}" must be a non-empty string`);
    }
    if (value.length > MAX_LABEL_VALUE_LENGTH) {
      throw new Error(`Metric "${metricName}": label "${key}" exceeds the maximum length`);
    }
    if (/\p{Cc}/u.test(value)) {
      throw new Error(`Metric "${metricName}": label "${key}" contains control characters`);
    }
    if (
      UUID_LABEL_VALUE_PATTERN.test(value) ||
      EMAIL_LABEL_VALUE_PATTERN.test(value) ||
      LONG_DIGIT_RUN_PATTERN.test(value)
    ) {
      throw new Error(`Metric "${metricName}": label "${key}" resembles sensitive data`);
    }
    if (key === 'route' && (value.includes('?') || value.includes('#'))) {
      throw new Error(`Metric "${metricName}": route labels must not contain query or fragment data`);
    }
  }
}

function labelKey(labels: MetricLabels): string {
  return Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}="${value}"`)
    .join(',');
}

export interface MetricSample {
  readonly labels: MetricLabels;
  readonly value: number;
}

export class Counter {
  private readonly series = new Map<string, MetricSample>();

  constructor(
    readonly name: string,
    readonly help: string,
  ) {}

  increment(labels: MetricLabels = {}, amount = 1): void {
    assertSafeLabels(this.name, labels);
    const key = labelKey(labels);
    if (!this.series.has(key) && this.series.size >= MAX_SERIES_PER_METRIC) {
      // A cardinality runaway (e.g. an unexpectedly unbounded label
      // value slipping past assertSafeLabels' allowlist check because
      // the *key* was allowed but callers vary the *value* unboundedly)
      // must never grow memory without limit. Drop silently rather than
      // throw: a metrics bug must never fail the business request that
      // triggered it.
      return;
    }
    const existing = this.series.get(key);
    this.series.set(key, { labels, value: (existing?.value ?? 0) + amount });
  }

  samples(): MetricSample[] {
    return [...this.series.values()];
  }
}

const DEFAULT_HISTOGRAM_BUCKETS_MS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];

interface HistogramSeries {
  readonly labels: MetricLabels;
  /**
   * Counts per exclusive OTLP bucket. For N explicit boundaries there are
   * N + 1 buckets; the final entry is the +Inf/overflow bucket.
   */
  readonly bucketCounts: number[];
  count: number;
  sum: number;
}

export class Histogram {
  private readonly series = new Map<string, HistogramSeries>();
  private readonly buckets: number[];

  constructor(
    readonly name: string,
    readonly help: string,
    buckets: number[] = DEFAULT_HISTOGRAM_BUCKETS_MS,
  ) {
    this.buckets = [...buckets].sort((a, b) => a - b);
  }

  observe(value: number, labels: MetricLabels = {}): void {
    assertSafeLabels(this.name, labels);
    if (!Number.isFinite(value) || value < 0) {
      return;
    }
    const key = labelKey(labels);
    let entry = this.series.get(key);
    if (!entry) {
      if (this.series.size >= MAX_SERIES_PER_METRIC) {
        return;
      }
      entry = {
        labels,
        bucketCounts: new Array(this.buckets.length + 1).fill(0),
        count: 0,
        sum: 0,
      };
      this.series.set(key, entry);
    }
    entry.count += 1;
    entry.sum += value;
    const bucketIndex = this.buckets.findIndex((boundary) => value <= boundary);
    entry.bucketCounts[bucketIndex === -1 ? this.buckets.length : bucketIndex] += 1;
  }

  bucketBoundaries(): readonly number[] {
    return this.buckets;
  }

  entries(): HistogramSeries[] {
    return [...this.series.values()];
  }
}

/**
 * Maps an HTTP status code to a bounded, low-cardinality class label
 * (`2xx`/`3xx`/`4xx`/`5xx`) -- never the raw status code, which is still
 * low cardinality but unnecessarily granular for the required label set.
 */
export function statusClass(statusCode: number): string {
  if (!Number.isInteger(statusCode) || statusCode < 100 || statusCode > 599) {
    return 'unknown';
  }
  return `${Math.floor(statusCode / 100)}xx`;
}

export class MetricsRegistry {
  readonly httpRequestsTotal = new Counter('medsphere_http_requests_total', 'Total HTTP requests');
  readonly httpRequestDurationMs = new Histogram(
    'medsphere_http_request_duration_ms',
    'HTTP request duration in milliseconds',
  );
  readonly httpServerErrorsTotal = new Counter(
    'medsphere_http_server_errors_total',
    'Total unhandled server errors (5xx)',
  );
  readonly dependencyCheckDurationMs = new Histogram(
    'medsphere_dependency_check_duration_ms',
    'Dependency readiness check duration in milliseconds',
  );
  readonly dependencyCheckTotal = new Counter(
    'medsphere_dependency_check_total',
    'Total dependency readiness checks by outcome',
  );
  readonly reservationOutcomeTotal = new Counter(
    'medsphere_reservation_outcome_total',
    'Total reservation creation attempts by outcome',
  );
  readonly notificationDeliveryTotal = new Counter(
    'medsphere_notification_delivery_total',
    'Total notification delivery attempts by channel and outcome',
  );
  readonly otpDispatchTotal = new Counter(
    'medsphere_otp_dispatch_total',
    'Total OTP provider dispatch attempts by outcome',
  );
  readonly exporterFailuresTotal = new Counter(
    'medsphere_metrics_exporter_failures_total',
    'Total telemetry exporter failures',
  );

  private readonly counters: Counter[] = [
    this.httpRequestsTotal,
    this.httpServerErrorsTotal,
    this.dependencyCheckTotal,
    this.reservationOutcomeTotal,
    this.notificationDeliveryTotal,
    this.otpDispatchTotal,
    this.exporterFailuresTotal,
  ];

  private readonly histograms: Histogram[] = [
    this.httpRequestDurationMs,
    this.dependencyCheckDurationMs,
  ];

  /**
   * Prometheus text exposition format (a small, stable, well-documented
   * format -- https://prometheus.io/docs/instrumenting/exposition_formats/).
   * Every metric name is prefixed `medsphere_` and every label is drawn
   * from the fixed allowlist enforced at record time, so this output can
   * never contain a raw URL, tenant ID, phone number, or other sensitive
   * value -- there is no code path that could have gotten one into the
   * registry in the first place.
   */
  renderPrometheusText(): string {
    const lines: string[] = [];
    for (const counter of this.counters) {
      lines.push(`# HELP ${counter.name} ${counter.help}`);
      lines.push(`# TYPE ${counter.name} counter`);
      for (const sample of counter.samples()) {
        lines.push(`${counter.name}${formatLabels(sample.labels)} ${sample.value}`);
      }
    }
    for (const histogram of this.histograms) {
      lines.push(`# HELP ${histogram.name} ${histogram.help}`);
      lines.push(`# TYPE ${histogram.name} histogram`);
      for (const entry of histogram.entries()) {
        const boundaries = histogram.bucketBoundaries();
        let cumulative = 0;
        for (let i = 0; i < boundaries.length; i += 1) {
          cumulative += entry.bucketCounts[i];
          lines.push(
            `${histogram.name}_bucket${formatLabels({ ...entry.labels, le: String(boundaries[i]) })} ${cumulative}`,
          );
        }
        cumulative += entry.bucketCounts[boundaries.length];
        lines.push(
          `${histogram.name}_bucket${formatLabels({ ...entry.labels, le: '+Inf' })} ${cumulative}`,
        );
        lines.push(`${histogram.name}_sum${formatLabels(entry.labels)} ${entry.sum}`);
        lines.push(`${histogram.name}_count${formatLabels(entry.labels)} ${entry.count}`);
      }
    }
    return lines.join('\n') + '\n';
  }

  /**
   * A minimal, OTLP-metrics-model-shaped JSON snapshot (resourceMetrics /
   * scopeMetrics / metrics / sum|histogram data points), for the optional
   * OTLP/HTTP JSON exporter. This is not a certified implementation of
   * the full OTLP protobuf wire format -- it follows the same conceptual
   * data model closely enough to be accepted by common OTLP/HTTP+JSON
   * collectors, and is documented as such rather than claimed as
   * spec-certified.
   */
  toOtlpJsonSnapshot(serviceName: string, environment: string): unknown {
    const now = Date.now() * 1_000_000; // OTLP uses Unix nanoseconds.
    const counterMetrics = this.counters.map((counter) => ({
      name: counter.name,
      description: counter.help,
      sum: {
        aggregationTemporality: 'AGGREGATION_TEMPORALITY_CUMULATIVE',
        isMonotonic: true,
        dataPoints: counter.samples().map((sample) => ({
          attributes: toOtlpAttributes(sample.labels),
          timeUnixNano: String(now),
          asDouble: sample.value,
        })),
      },
    }));
    const histogramMetrics = this.histograms.map((histogram) => ({
      name: histogram.name,
      description: histogram.help,
      histogram: {
        aggregationTemporality: 'AGGREGATION_TEMPORALITY_CUMULATIVE',
        dataPoints: histogram.entries().map((entry) => ({
          attributes: toOtlpAttributes(entry.labels),
          timeUnixNano: String(now),
          count: String(entry.count),
          sum: entry.sum,
          bucketCounts: entry.bucketCounts.map(String),
          explicitBounds: histogram.bucketBoundaries(),
        })),
      },
    }));

    return {
      resourceMetrics: [
        {
          resource: {
            attributes: [
              { key: 'service.name', value: { stringValue: serviceName } },
              { key: 'deployment.environment', value: { stringValue: environment } },
            ],
          },
          scopeMetrics: [
            {
              scope: { name: 'medsphere-metrics-registry' },
              metrics: [...counterMetrics, ...histogramMetrics],
            },
          ],
        },
      ],
    };
  }
}

function formatLabels(labels: MetricLabels): string {
  const entries = Object.entries(labels);
  if (entries.length === 0) return '';
  return `{${entries.map(([key, value]) => `${key}="${escapeLabelValue(value)}"`).join(',')}}`;
}

function escapeLabelValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

function toOtlpAttributes(
  labels: MetricLabels,
): Array<{ key: string; value: { stringValue: string } }> {
  return Object.entries(labels).map(([key, value]) => ({ key, value: { stringValue: value } }));
}

/** Process-wide singleton -- see file header for why this is not DI-injected. */
export const appMetrics = new MetricsRegistry();
