import { expect, test } from '@playwright/test';
import networkBudget from '../../../docs/architecture/network-efficiency-budget.json';

const profile = networkBudget.slowNetworkProfile;
const acceptedEncodings = new Set(networkBudget.compressionPolicy.acceptedEncodings);
const baseOrigin = new URL(process.env.FRONTEND ?? 'http://localhost:3001').origin;

test.describe('Task 0059 constrained-mobile public-route budgets', () => {
  test.use({ serviceWorkers: 'block' });

  for (const routeBudget of networkBudget.publicRouteBudgets) {
    test(`${routeBudget.path} stays within cold-transfer/request budget on constrained mobile`, async ({
      page,
      context,
    }) => {
      await page.setViewportSize({ width: 390, height: 844 });

      const externalRequests = new Set<string>();
      page.on('request', (request) => {
        const url = new URL(request.url());
        if (url.origin !== baseOrigin) externalRequests.add(url.origin);
      });

      const cdp = await context.newCDPSession(page);
      await cdp.send('Network.enable');
      await cdp.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: profile.latencyMs,
        downloadThroughput: (profile.downloadKbps * 1024) / 8,
        uploadThroughput: (profile.uploadKbps * 1024) / 8,
        connectionType: 'cellular4g',
      });

      const startedAt = Date.now();
      const response = await page.goto(routeBudget.path, { waitUntil: 'networkidle' });
      const readyMs = Date.now() - startedAt;

      expect(response).not.toBeNull();
      expect(response?.ok()).toBe(true);
      await expect(page.locator('main')).toBeVisible();

      const metrics = await page.evaluate(() => {
        const navigation = performance.getEntriesByType(
          'navigation',
        )[0] as PerformanceNavigationTiming;
        const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
        const entries = [navigation, ...resources].filter(Boolean);

        return {
          transferBytes: entries.reduce((total, entry) => total + (entry.transferSize || 0), 0),
          requestCount: entries.length,
          navigationTransferBytes: navigation?.transferSize ?? 0,
          resourceTransferBytes: resources.reduce(
            (total, entry) => total + (entry.transferSize || 0),
            0,
          ),
          horizontalOverflow:
            document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        };
      });

      const encoding = response?.headers()['content-encoding'] ?? '';
      expect(
        acceptedEncodings.has(encoding),
        `${routeBudget.path} HTML should be compressed; got content-encoding="${encoding}"`,
      ).toBe(true);
      expect(metrics.transferBytes).toBeGreaterThan(0);
      expect(
        metrics.transferBytes,
        `${routeBudget.path} transferred ${metrics.transferBytes} bytes (budget ${routeBudget.maxColdTransferBytes})`,
      ).toBeLessThanOrEqual(routeBudget.maxColdTransferBytes);
      expect(
        metrics.requestCount,
        `${routeBudget.path} made ${metrics.requestCount} requests (budget ${routeBudget.maxRequests})`,
      ).toBeLessThanOrEqual(routeBudget.maxRequests);
      expect(
        readyMs,
        `${routeBudget.path} became network-idle in ${readyMs}ms (budget ${routeBudget.maxReadyMs}ms)`,
      ).toBeLessThanOrEqual(routeBudget.maxReadyMs);
      expect(metrics.horizontalOverflow).toBe(false);
      expect([...externalRequests]).toEqual([]);

      console.log(
        JSON.stringify({
          route: routeBudget.path,
          profile: profile.name,
          readyMs,
          transferBytes: metrics.transferBytes,
          navigationTransferBytes: metrics.navigationTransferBytes,
          resourceTransferBytes: metrics.resourceTransferBytes,
          requestCount: metrics.requestCount,
          contentEncoding: encoding,
        }),
      );
    });
  }
});

test('Task 0059 public-static cache headers are bounded and service-worker code revalidates', async ({
  request,
}) => {
  for (const pathname of ['/manifest.webmanifest', '/icon.svg']) {
    const response = await request.get(pathname);
    expect(response.ok()).toBe(true);
    expect(response.headers()['cache-control']).toBe(networkBudget.cachePolicy.publicStatic);
  }

  const serviceWorker = await request.get('/sw.js');
  expect(serviceWorker.ok()).toBe(true);
  expect(serviceWorker.headers()['cache-control']).toBe(networkBudget.cachePolicy.serviceWorker);
});
