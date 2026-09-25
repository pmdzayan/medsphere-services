import fs from 'node:fs';

export function validateAlertWebhookUrl(value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return ['Alert webhook URL is empty.'];
  }

  let parsed;
  try {
    parsed = new URL(value.trim());
  } catch {
    return ['Alert webhook URL is not a valid absolute URL.'];
  }

  const failures = [];
  if (parsed.protocol !== 'https:') failures.push('Alert webhook URL must use HTTPS.');
  if (parsed.username || parsed.password) {
    failures.push('Alert webhook URL must not contain URL userinfo credentials.');
  }
  if (parsed.hash) failures.push('Alert webhook URL must not contain a fragment.');
  if (!parsed.hostname) failures.push('Alert webhook URL must include a hostname.');
  return failures;
}

export function run() {
  const file = process.env.AIM_ALERT_WEBHOOK_URL_FILE;
  if (!file) {
    process.stderr.write('AIM_ALERT_WEBHOOK_URL_FILE is required.\n');
    return 1;
  }

  let value;
  try {
    value = fs.readFileSync(file, 'utf8');
  } catch {
    process.stderr.write('Unable to read AIM alert webhook secret file.\n');
    return 1;
  }

  const failures = validateAlertWebhookUrl(value);
  if (failures.length > 0) {
    for (const failure of failures) process.stderr.write(`${failure}\n`);
    return 1;
  }

  process.stdout.write('AIM alert webhook secret: PASS (valid HTTPS destination)\n');
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = run();
}
