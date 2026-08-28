import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const { MetricsRegistry } = require('../dist/metrics/metrics-registry.js');
const {
  OtlpMetricsExporter,
  parseMetricsExportConfig,
  MetricsExportConfigError,
} = require('../dist/metrics/otlp-exporter.js');

test('parseMetricsExportConfig is disabled by default (local-safe)', () => {
  const config = parseMetricsExportConfig({}, { serviceName: 'auth-service' });
  assert.equal(config.enabled, false);
  assert.equal(config.serviceName, 'auth-service');
});

test('parseMetricsExportConfig fails closed when enabled without an endpoint', () => {
  assert.throws(
    () =>
      parseMetricsExportConfig(
        { TELEMETRY_METRICS_EXPORT_ENABLED: 'true' },
        { serviceName: 'auth-service' },
      ),
    MetricsExportConfigError,
  );
});

test('parseMetricsExportConfig fails closed on a malformed enabled flag', () => {
  assert.throws(
    () =>
      parseMetricsExportConfig(
        { TELEMETRY_METRICS_EXPORT_ENABLED: 'yes' },
        { serviceName: 'auth-service' },
      ),
    MetricsExportConfigError,
  );
});

test('parseMetricsExportConfig fails closed on a non-HTTPS endpoint', () => {
  assert.throws(
    () =>
      parseMetricsExportConfig(
        {
          TELEMETRY_METRICS_EXPORT_ENABLED: 'true',
          TELEMETRY_METRICS_EXPORT_ENDPOINT: 'http://collector.internal:4318/v1/metrics',
        },
        { serviceName: 'auth-service' },
      ),
    MetricsExportConfigError,
  );
});

test('parseMetricsExportConfig fails closed on an out-of-bounds timeout', () => {
  assert.throws(
    () =>
      parseMetricsExportConfig(
        {
          TELEMETRY_METRICS_EXPORT_ENABLED: 'true',
          TELEMETRY_METRICS_EXPORT_ENDPOINT: 'https://collector.example.com/v1/metrics',
          TELEMETRY_METRICS_EXPORT_TIMEOUT_MS: '99999',
        },
        { serviceName: 'auth-service' },
      ),
    MetricsExportConfigError,
  );
});

test('parseMetricsExportConfig fails closed when a named credential-reference variable is missing', () => {
  assert.throws(
    () =>
      parseMetricsExportConfig(
        {
          TELEMETRY_METRICS_EXPORT_ENABLED: 'true',
          TELEMETRY_METRICS_EXPORT_ENDPOINT: 'https://collector.example.com/v1/metrics',
          TELEMETRY_METRICS_EXPORT_HEADER_CREDENTIAL_REFERENCE: 'OTLP_TOKEN',
        },
        { serviceName: 'auth-service' },
      ),
    MetricsExportConfigError,
  );
});

test('parseMetricsExportConfig accepts a valid enabled configuration', () => {
  const config = parseMetricsExportConfig(
    {
      TELEMETRY_METRICS_EXPORT_ENABLED: 'true',
      TELEMETRY_METRICS_EXPORT_ENDPOINT: 'https://collector.example.com/v1/metrics',
      TELEMETRY_METRICS_EXPORT_HEADER_CREDENTIAL_REFERENCE: 'OTLP_TOKEN',
      OTLP_TOKEN: 'Bearer secret-value',
    },
    { serviceName: 'auth-service' },
  );
  assert.equal(config.enabled, true);
  assert.equal(config.endpoint, 'https://collector.example.com/v1/metrics');
  assert.equal(config.authorizationHeaderValue, 'Bearer secret-value');
});

test('OtlpMetricsExporter.exportOnce is a no-op when disabled', async () => {
  const registry = new MetricsRegistry();
  const exporter = new OtlpMetricsExporter(
    {
      enabled: false,
      serviceName: 'auth-service',
      environment: 'test',
      timeoutMs: 5000,
      intervalMs: 60000,
    },
    registry,
    async () => {
      throw new Error('fetch must never be called when disabled');
    },
  );
  const outcome = await exporter.exportOnce();
  assert.equal(outcome, 'disabled');
});

test('OtlpMetricsExporter.exportOnce succeeds and never throws on a healthy collector', async () => {
  const registry = new MetricsRegistry();
  const fetchCalls = [];
  const fakeFetch = async (url, init) => {
    fetchCalls.push({ url, init });
    return new Response('{}', { status: 200 });
  };
  const exporter = new OtlpMetricsExporter(
    {
      enabled: true,
      endpoint: 'https://collector.example.com/v1/metrics',
      serviceName: 'auth-service',
      environment: 'test',
      timeoutMs: 5000,
      intervalMs: 60000,
    },
    registry,
    fakeFetch,
  );
  const outcome = await exporter.exportOnce();
  assert.equal(outcome, 'success');
  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].url, 'https://collector.example.com/v1/metrics');
});

test('a monitoring backend outage never throws -- exportOnce resolves "failure" and increments a bounded counter', async () => {
  const registry = new MetricsRegistry();
  const failingFetch = async () => {
    throw new Error('ECONNREFUSED');
  };
  const exporter = new OtlpMetricsExporter(
    {
      enabled: true,
      endpoint: 'https://collector.example.com/v1/metrics',
      serviceName: 'auth-service',
      environment: 'test',
      timeoutMs: 5000,
      intervalMs: 60000,
    },
    registry,
    failingFetch,
  );
  const outcome = await exporter.exportOnce();
  assert.equal(outcome, 'failure');
  const failureSamples = registry.exporterFailuresTotal.samples();
  assert.equal(failureSamples[0].value, 1);
});

test('exporter timeout is bounded via AbortSignal', async () => {
  const registry = new MetricsRegistry();
  let observedSignal;
  const fetchImpl = async (_url, init) => {
    observedSignal = init.signal;
    return new Response('{}', { status: 200 });
  };
  const exporter = new OtlpMetricsExporter(
    {
      enabled: true,
      endpoint: 'https://collector.example.com/v1/metrics',
      serviceName: 'auth-service',
      environment: 'test',
      timeoutMs: 250,
      intervalMs: 60000,
    },
    registry,
    fetchImpl,
  );
  await exporter.exportOnce();
  assert.ok(observedSignal instanceof AbortSignal);
});

test('repeated export failures are rate-limited in the logger, not logged on every attempt', async () => {
  const registry = new MetricsRegistry();
  const failingFetch = async () => {
    throw new Error('ECONNREFUSED');
  };
  const warnings = [];
  const exporter = new OtlpMetricsExporter(
    {
      enabled: true,
      endpoint: 'https://collector.example.com/v1/metrics',
      serviceName: 'auth-service',
      environment: 'test',
      timeoutMs: 5000,
      intervalMs: 60000,
    },
    registry,
    failingFetch,
    { warn: (message, meta) => warnings.push({ message, meta }) },
  );
  for (let i = 0; i < 25; i += 1) {
    await exporter.exportOnce();
  }
  // Logged on failure #1 and #10 and #20 only (throttled every 10th) -- not all 25.
  assert.equal(warnings.length, 3);
  assert.ok(warnings.every((w) => !JSON.stringify(w).includes('collector.example.com')));
});

test('a business-relevant caller (simulated) never fails merely because the exporter is unavailable', async () => {
  const registry = new MetricsRegistry();
  const failingFetch = async () => {
    throw new Error('backend outage');
  };
  const exporter = new OtlpMetricsExporter(
    {
      enabled: true,
      endpoint: 'https://collector.example.com/v1/metrics',
      serviceName: 'auth-service',
      environment: 'test',
      timeoutMs: 5000,
      intervalMs: 60000,
    },
    registry,
    failingFetch,
  );

  async function simulatedBusinessRequest() {
    // A business operation that fires-and-forgets a metrics export
    // alongside its real work must still succeed even if export fails.
    await exporter.exportOnce();
    return 'business-operation-result';
  }

  const result = await simulatedBusinessRequest();
  assert.equal(result, 'business-operation-result');
});
