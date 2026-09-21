import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const compose = fs.readFileSync(path.join(root, 'compose/docker-compose.services.yml'), 'utf8');
const config = fs.readFileSync(
  path.join(root, 'compose/observability/otel-collector-config.yml'),
  'utf8',
);

describe('AIM OpenTelemetry Collector boundary', () => {
  it('pins the collector image rather than using latest', () => {
    assert.match(
      compose,
      /otel\/opentelemetry-collector-contrib:0\.161\.0/,
    );
    assert.doesNotMatch(compose, /otel\/opentelemetry-collector-contrib:latest/);
  });

  it('binds operator endpoints to localhost only', () => {
    assert.match(compose, /127\.0\.0\.1:9464:9464/);
    assert.match(compose, /127\.0\.0\.1:13133:13133/);
  });

  it('scrapes only the existing bounded metrics endpoint', () => {
    assert.match(config, /metrics_path:\s*\/metrics/);
    assert.match(config, /auth-service:3000/);
    assert.doesNotMatch(config, /patient|medicine|email|phone|tenantId|userId/i);
  });

  it('places memory limiting and batching before export', () => {
    assert.match(config, /memory_limiter:/);
    assert.match(config, /batch:/);
    assert.match(config, /exporters:[\s\S]*prometheus:/);
  });
});
