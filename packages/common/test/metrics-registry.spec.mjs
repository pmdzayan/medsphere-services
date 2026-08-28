import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const {
  Counter,
  Histogram,
  MetricsRegistry,
  statusClass,
} = require('../dist/metrics/metrics-registry.js');

test('statusClass buckets status codes into low-cardinality classes', () => {
  assert.equal(statusClass(200), '2xx');
  assert.equal(statusClass(301), '3xx');
  assert.equal(statusClass(404), '4xx');
  assert.equal(statusClass(503), '5xx');
});

test('statusClass returns unknown for an invalid status code rather than throwing', () => {
  assert.equal(statusClass(-1), 'unknown');
  assert.equal(statusClass(9999), 'unknown');
  assert.equal(statusClass(NaN), 'unknown');
});

test('Counter increments and accumulates per unique label set', () => {
  const counter = new Counter('test_total', 'help text');
  counter.increment({ outcome: 'success' });
  counter.increment({ outcome: 'success' });
  counter.increment({ outcome: 'failure' });
  const samples = counter.samples();
  assert.equal(samples.find((s) => s.labels.outcome === 'success').value, 2);
  assert.equal(samples.find((s) => s.labels.outcome === 'failure').value, 1);
});

test('Counter rejects a label key outside the allowed low-cardinality allowlist', () => {
  const counter = new Counter('test_total', 'help text');
  assert.throws(() => counter.increment({ tenantId: 'abc-123' }), /not on the allowed/);
  assert.throws(() => counter.increment({ phone: '+15551234567' }), /not on the allowed/);
  assert.throws(() => counter.increment({ requestId: 'req-1' }), /not on the allowed/);
});

test('Counter rejects an empty label value', () => {
  const counter = new Counter('test_total', 'help text');
  assert.throws(() => counter.increment({ outcome: '' }));
});

test('Counter drops a series once the per-metric cardinality cap is reached, without throwing', () => {
  const counter = new Counter('test_total', 'help text');
  for (let i = 0; i < 600; i += 1) {
    counter.increment({ provider: `p${i}` });
  }
  assert.ok(counter.samples().length <= 500);
});

test('Histogram records observations into exclusive OTLP buckets and tracks count/sum', () => {
  const histogram = new Histogram('test_duration_ms', 'help text', [10, 50, 100]);
  histogram.observe(5, { route: '/x' });
  histogram.observe(30, { route: '/x' });
  histogram.observe(200, { route: '/x' });
  const [entry] = histogram.entries();
  assert.equal(entry.count, 3);
  assert.equal(entry.sum, 235);
  assert.deepEqual(entry.bucketCounts, [1, 1, 0, 1]);
});

test('Histogram ignores a negative or non-finite observation rather than corrupting the series', () => {
  const histogram = new Histogram('test_duration_ms', 'help text');
  histogram.observe(-5);
  histogram.observe(NaN);
  histogram.observe(Infinity);
  assert.deepEqual(histogram.entries(), []);
});

test('Histogram rejects a disallowed label key', () => {
  const histogram = new Histogram('test_duration_ms', 'help text');
  assert.throws(() => histogram.observe(10, { userId: 'u1' }), /not on the allowed/);
});

test('metrics reject sensitive-looking values even when the label key is allowed', () => {
  const counter = new Counter('test_total', 'help text');
  assert.throws(() => counter.increment({ provider: 'person@example.com' }), /sensitive data/);
  assert.throws(
    () => counter.increment({ route: '/users/123e4567-e89b-42d3-a456-426614174000' }),
    /sensitive data/,
  );
  assert.throws(() => counter.increment({ route: '/search?phone=919876543210' }));
});

test('renderPrometheusText produces valid-shaped Prometheus text exposition output', () => {
  const registry = new MetricsRegistry();
  registry.httpRequestsTotal.increment({
    service: 'auth-service',
    method: 'GET',
    route: '/health/live',
    status_class: '2xx',
  });
  registry.httpRequestDurationMs.observe(42, { service: 'auth-service', route: '/health/live' });

  const text = registry.renderPrometheusText();
  assert.match(text, /# HELP medsphere_http_requests_total/);
  assert.match(text, /# TYPE medsphere_http_requests_total counter/);
  assert.match(text, /medsphere_http_requests_total\{/);
  assert.match(text, /status_class="2xx"/);
  assert.match(text, /# TYPE medsphere_http_request_duration_ms histogram/);
  assert.match(text, /medsphere_http_request_duration_ms_bucket\{/);
  assert.match(text, /le="\+Inf"/);
  assert.match(text, /medsphere_http_request_duration_ms_sum\{/);
  assert.match(text, /medsphere_http_request_duration_ms_count\{/);
});

test('renderPrometheusText emits correct cumulative histogram buckets exactly once', () => {
  const registry = new MetricsRegistry();
  registry.httpRequestDurationMs.observe(7, { service: 'auth-service' });
  registry.httpRequestDurationMs.observe(20, { service: 'auth-service' });
  registry.httpRequestDurationMs.observe(20_000, { service: 'auth-service' });

  const text = registry.renderPrometheusText();
  assert.match(text, /le="10"\} 1/);
  assert.match(text, /le="25"\} 2/);
  assert.match(text, /le="\+Inf"\} 3/);
});

test('renderPrometheusText never contains a raw tenant/phone/UUID -- no code path could add one', () => {
  const registry = new MetricsRegistry();
  registry.httpRequestsTotal.increment({
    service: 'auth-service',
    method: 'POST',
    route: '/api/inventory/providers/:providerId/reservations',
    status_class: '2xx',
  });
  registry.reservationOutcomeTotal.increment({ outcome: 'success' });
  registry.notificationDeliveryTotal.increment({ channel: 'SMS', outcome: 'DELIVERED' });
  registry.otpDispatchTotal.increment({ outcome: 'success' });

  const text = registry.renderPrometheusText();
  assert.doesNotMatch(text, /tenant/i);
  assert.doesNotMatch(text, /\+?\d{10,}/);
  assert.doesNotMatch(text, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
});

test('toOtlpJsonSnapshot produces an OTLP-metrics-model-shaped snapshot', () => {
  const registry = new MetricsRegistry();
  registry.httpRequestsTotal.increment({ service: 'auth-service', status_class: '2xx' });
  const snapshot = registry.toOtlpJsonSnapshot('auth-service', 'production');
  assert.equal(snapshot.resourceMetrics.length, 1);
  const serviceNameAttr = snapshot.resourceMetrics[0].resource.attributes.find(
    (a) => a.key === 'service.name',
  );
  assert.equal(serviceNameAttr.value.stringValue, 'auth-service');
  const metricNames = snapshot.resourceMetrics[0].scopeMetrics[0].metrics.map((m) => m.name);
  assert.ok(metricNames.includes('medsphere_http_requests_total'));
});

test('toOtlpJsonSnapshot includes the required overflow histogram bucket', () => {
  const registry = new MetricsRegistry();
  registry.httpRequestDurationMs.observe(20_000, { service: 'auth-service' });
  const snapshot = registry.toOtlpJsonSnapshot('auth-service', 'production');
  const histogramMetric = snapshot.resourceMetrics[0].scopeMetrics[0].metrics.find(
    (metric) => metric.name === 'medsphere_http_request_duration_ms',
  );
  const point = histogramMetric.histogram.dataPoints[0];
  assert.equal(point.bucketCounts.length, point.explicitBounds.length + 1);
  assert.equal(point.bucketCounts.at(-1), '1');
});
