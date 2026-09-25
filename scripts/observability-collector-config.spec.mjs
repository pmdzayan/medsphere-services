import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const compose = fs.readFileSync(path.join(root, 'compose/docker-compose.services.yml'), 'utf8');
const productionCompose = fs.readFileSync(
  path.join(root, 'compose/docker-compose.observability.yml'),
  'utf8',
);
const config = fs.readFileSync(
  path.join(root, 'compose/observability/otel-collector-config.yml'),
  'utf8',
);
const prometheus = fs.readFileSync(
  path.join(root, 'compose/observability/prometheus.yml'),
  'utf8',
);
const alertmanager = fs.readFileSync(
  path.join(root, 'compose/observability/alertmanager.yml'),
  'utf8',
);
const loggingPolicy = fs.readFileSync(
  path.join(root, 'compose/docker-compose.logging-policy.yml'),
  'utf8',
);
const alertRules = fs.readFileSync(
  path.join(root, 'docs/operations/v1-alert-rules.prometheus.yml'),
  'utf8',
);

describe('AIM OpenTelemetry Collector boundary', () => {
  it('pins the collector image rather than using latest', () => {
    assert.match(compose, /otel\/opentelemetry-collector-contrib:0\.161\.0/);
    assert.doesNotMatch(compose, /otel\/opentelemetry-collector-contrib:latest/);
  });

  it('binds collector operator endpoints to localhost only', () => {
    assert.match(compose, /127\.0\.0\.1:9464:9464/);
    assert.match(compose, /127\.0\.0\.1:13133:13133/);
  });

  it('scrapes only the existing bounded metrics endpoint', () => {
    assert.match(config, /metrics_path:\s*\/metrics/);
    assert.match(config, /auth-service:3000/);
    assert.doesNotMatch(config, /patient|medicine|email|phone|tenantId|userId/i);
  });

  it('filters collector output to AIM metrics and target health before export', () => {
    assert.match(config, /filter\/aim_metrics:/);
    assert.match(config, /\^medsphere_\.\*/);
    assert.match(config, /\^up\$/);
    assert.match(
      config,
      /processors:[\s\S]*memory_limiter[\s\S]*filter\/aim_metrics[\s\S]*batch/,
    );
    assert.doesNotMatch(config, /namespace:\s*aim/);
    assert.doesNotMatch(config, /debug:/);
  });
});

describe('Task 0049 production metrics and alerting boundary', () => {
  it('pins stable Prometheus and Alertmanager images with explicit retention', () => {
    assert.match(productionCompose, /prom\/prometheus:v3\.14\.0/);
    assert.match(productionCompose, /prom\/alertmanager:v0\.34\.1/);
    assert.match(productionCompose, /--storage\.tsdb\.retention\.time=30d/);
    assert.match(productionCompose, /--storage\.tsdb\.retention\.size=10GB/);
    assert.match(productionCompose, /--data\.retention=720h/);
    assert.doesNotMatch(productionCompose, /:latest/);
  });

  it('keeps Prometheus and Alertmanager off host ports', () => {
    assert.match(productionCompose, /aim-prometheus:[\s\S]*expose:[\s\S]*'9090'/);
    assert.match(productionCompose, /aim-alertmanager:[\s\S]*expose:[\s\S]*'9093'/);
    assert.doesNotMatch(productionCompose, /(?:^|\n)\s*ports:\s*\n/);
  });

  it('isolates monitoring from application containers and gives egress only to Alertmanager', () => {
    assert.match(productionCompose, /aim-observability:\n\s+internal:\s+true/);
    assert.match(
      productionCompose,
      /aim-otel-collector:[\s\S]*networks:[\s\S]*medsphere-apps[\s\S]*aim-observability/,
    );
    assert.match(
      productionCompose,
      /aim-prometheus:[\s\S]*networks:\n\s+- aim-observability/,
    );
    assert.match(
      productionCompose,
      /aim-alertmanager:[\s\S]*networks:[\s\S]*aim-observability[\s\S]*aim-alert-egress/,
    );
    assert.doesNotMatch(
      productionCompose,
      /aim-prometheus:[\s\S]*networks:[\s\S]*medsphere-apps/,
    );
  });

  it('scrapes the collector instead of the application database or protected routes', () => {
    assert.match(prometheus, /aim-otel-collector:9464/);
    assert.match(prometheus, /honor_labels:\s*true/);
    assert.match(prometheus, /metric_relabel_configs:/);
    assert.match(prometheus, /\(medsphere_\.\+\|up\)/);
    assert.doesNotMatch(prometheus, /postgres|database|patient|medicine|tenant|user/i);
  });

  it('defines bounded security alerts without identity dimensions', () => {
    for (const alertName of [
      'AimCredentialReplayDetected',
      'AimRepeatedWorkstationUnlockFailure',
      'AimAuthorizationDenialSpike',
      'AimJoinCodeRejectionSpike',
    ]) {
      assert.match(alertRules, new RegExp(`alert: ${alertName}`));
    }
    assert.match(alertRules, /medsphere_security_event_total/);
    assert.doesNotMatch(
      alertRules,
      /tenantId|userId|providerId|membershipId|email|phone|requestId|ipAddress/i,
    );
  });

  it('routes alerts by severity using a secret-backed webhook URL', () => {
    assert.match(alertmanager, /severity="critical"/);
    assert.match(alertmanager, /receiver:\s*aim-critical/);
    assert.match(alertmanager, /receiver:\s*aim-warning/);
    assert.match(alertmanager, /url_file:\s*\/run\/secrets\/aim-alert-webhook-url/);
    assert.doesNotMatch(alertmanager, /https?:\/\//);
  });

  it('bounds local logs for accepted runtime and monitoring services', () => {
    assert.match(loggingPolicy, /driver:\s*local/);
    assert.match(loggingPolicy, /max-size:\s*20m/);
    assert.match(loggingPolicy, /max-file:\s*'10'/);
    for (const service of [
      'auth-service',
      'notification-worker',
      'aim-otel-collector',
      'aim-prometheus',
      'aim-alertmanager',
    ]) {
      assert.match(loggingPolicy, new RegExp(`\\n  ${service}:\\n    logging:`));
    }
  });
});
