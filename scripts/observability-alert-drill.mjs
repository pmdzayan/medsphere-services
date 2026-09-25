import fs from 'node:fs';

const ALERT_NAME = 'AimIncidentDrill';

export function validateAlertmanagerUrl(value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error('AIM_ALERTMANAGER_URL is required');
  }
  const parsed = new URL(value.trim());
  if (parsed.protocol !== 'https:') {
    throw new Error('AIM Alertmanager drill endpoint must use HTTPS');
  }
  if (parsed.username || parsed.password || parsed.hash) {
    throw new Error('AIM Alertmanager drill endpoint must not use URL credentials or fragments');
  }
  return parsed;
}

export function buildSyntheticIncidentDrill(now = new Date()) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new Error('Invalid incident drill timestamp');
  }
  const endsAt = new Date(now.getTime() + 5 * 60 * 1000);
  return [
    {
      labels: {
        alertname: ALERT_NAME,
        severity: 'warning',
        category: 'synthetic_drill',
      },
      annotations: {
        summary: 'AIM observability incident drill',
        description: 'Synthetic operator-initiated alert using a fixed non-domain payload.',
      },
      startsAt: now.toISOString(),
      endsAt: endsAt.toISOString(),
    },
  ];
}

export async function runIncidentDrill({
  baseUrl,
  bearerToken,
  fetchImpl = fetch,
  now = new Date(),
}) {
  const base = validateAlertmanagerUrl(baseUrl);
  const endpoint = new URL('/api/v2/alerts', base);
  const headers = { 'content-type': 'application/json' };
  if (bearerToken) headers.authorization = `Bearer ${bearerToken}`;

  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(buildSyntheticIncidentDrill(now)),
  });
  if (!response.ok) {
    throw new Error(`AIM incident drill alert was rejected with HTTP ${response.status}`);
  }
}

async function main() {
  const baseUrl = process.env.AIM_ALERTMANAGER_URL;
  const tokenFile = process.env.AIM_ALERTMANAGER_BEARER_TOKEN_FILE;
  let token;
  if (tokenFile) {
    try {
      token = fs.readFileSync(tokenFile, 'utf8').trim();
    } catch {
      throw new Error('Unable to read AIM Alertmanager bearer-token file');
    }
  }

  await runIncidentDrill({ baseUrl, bearerToken: token });
  process.stdout.write(
    'AIM incident drill submitted. Verify routing and resolution in the approved alert channel.\n',
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : 'Incident drill failed'}\n`);
    process.exitCode = 1;
  });
}
