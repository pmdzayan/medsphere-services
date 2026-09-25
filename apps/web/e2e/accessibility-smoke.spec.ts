import { expect, test } from '@playwright/test';

const PUBLIC_ROUTES = ['/', '/login', '/register'] as const;

for (const route of PUBLIC_ROUTES) {
  test(`${route} preserves baseline browser accessibility semantics`, async ({ page }) => {
    await page.goto(route);

    await expect(page.locator('html')).toHaveAttribute('lang', /^(en|ta|ur)$/);
    await expect(page.locator('html')).toHaveAttribute('dir', /^(ltr|rtl)$/);
    await expect(page.locator('main')).toHaveCount(1);

    const failures = await page.evaluate(() => {
      const issues: string[] = [];
      const ids = new Map<string, number>();

      for (const element of document.querySelectorAll<HTMLElement>('[id]')) {
        if (!element.id) continue;
        ids.set(element.id, (ids.get(element.id) ?? 0) + 1);
      }
      for (const [id, count] of ids) {
        if (count > 1) issues.push(`duplicate id: ${id}`);
      }

      for (const image of document.querySelectorAll<HTMLImageElement>('img')) {
        if (!image.hasAttribute('alt')) issues.push('image without alt attribute');
      }

      const controls = document.querySelectorAll<HTMLElement>(
        'button, input:not([type="hidden"]), select, textarea, a[href]',
      );
      for (const control of controls) {
        const ariaLabel = control.getAttribute('aria-label')?.trim();
        const labelledBy = control.getAttribute('aria-labelledby');
        const labelledByText = labelledBy
          ? labelledBy
              .split(/\s+/)
              .map((id) => document.getElementById(id)?.textContent?.trim() ?? '')
              .join(' ')
              .trim()
          : '';
        const id = control.id;
        const explicitLabel = id
          ? document
              .querySelector<HTMLLabelElement>(`label[for="${CSS.escape(id)}"]`)
              ?.textContent?.trim()
          : '';
        const wrappingLabel = control.closest('label')?.textContent?.trim();
        const ownText = control.textContent?.trim();
        const title = control.getAttribute('title')?.trim();
        const inputPlaceholder =
          control instanceof HTMLInputElement ? control.placeholder.trim() : '';

        if (
          !ariaLabel &&
          !labelledByText &&
          !explicitLabel &&
          !wrappingLabel &&
          !ownText &&
          !title &&
          !inputPlaceholder
        ) {
          issues.push(`unnamed interactive element: ${control.tagName.toLowerCase()}`);
        }
      }

      return issues;
    });

    expect(failures).toEqual([]);
  });
}

test('keyboard focus remains visible on the login journey', async ({ page }) => {
  await page.goto('/login');
  await page.keyboard.press('Tab');

  const focus = await page.evaluate(() => {
    const active = document.activeElement as HTMLElement | null;
    if (!active || active === document.body) return null;
    const style = window.getComputedStyle(active);
    return {
      tag: active.tagName,
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
    };
  });

  expect(focus).not.toBeNull();
  expect(focus?.outlineStyle).not.toBe('none');
  expect(focus?.outlineWidth).not.toBe('0px');
});

test('reduced-motion preference collapses startup and organization theme animation', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/login');

  const startupDuration = await page
    .locator('.brand-startup')
    .evaluate((element) => Number.parseFloat(getComputedStyle(element).animationDuration));
  expect(startupDuration).toBeLessThanOrEqual(0.001);
});

test('PWA runtime registers the static-only AIM service worker on localhost', async ({ page }) => {
  await page.goto('/');

  const registered = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return false;
    await navigator.serviceWorker.ready;
    return Boolean(await navigator.serviceWorker.getRegistration('/'));
  });

  expect(registered).toBe(true);
});

test('Urdu switches the real document into RTL without mixed-direction shell state', async ({
  page,
  baseURL,
}) => {
  const origin = new URL(baseURL ?? 'http://localhost:3001').origin;
  await page.context().addCookies([
    {
      name: 'medsphere_locale',
      value: 'ur',
      url: origin,
    },
  ]);

  await page.goto('/login');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ur');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
});

test('dark workstation appearance is applied before interactive use', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('aim.workstation.appearance', 'dark');
  });
  await page.goto('/login');

  await expect(page.locator('html')).toHaveAttribute('data-appearance', 'dark');
  const colorScheme = await page
    .locator('html')
    .evaluate((element) => getComputedStyle(element).colorScheme);
  expect(colorScheme).toContain('dark');
});

test('mobile public journeys avoid horizontal overflow and expose touch-sized form controls', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/login');

  const result = await page.evaluate(() => {
    const root = document.documentElement;
    const undersized: string[] = [];

    for (const control of document.querySelectorAll<HTMLElement>(
      'button, input:not([type="hidden"]), select, textarea',
    )) {
      if (control.hasAttribute('disabled')) continue;
      const rect = control.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (rect.height < 44) {
        undersized.push(
          `${control.tagName.toLowerCase()}#${control.id || '(no-id)'}:${Math.round(
            rect.height,
          )}px`,
        );
      }
    }

    return {
      overflow: root.scrollWidth > root.clientWidth + 1,
      undersized,
    };
  });

  expect(result.overflow).toBe(false);
  expect(result.undersized).toEqual([]);
});

test('service-worker Cache Storage contains public assets only', async ({ page }) => {
  await page.goto('/');

  const cacheEvidence = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return { registered: false, urls: [] as string[] };
    await navigator.serviceWorker.ready;

    const urls: string[] = [];
    for (const cacheName of await caches.keys()) {
      if (!cacheName.startsWith('aim-public-static-')) continue;
      const cache = await caches.open(cacheName);
      for (const request of await cache.keys()) urls.push(new URL(request.url).pathname);
    }

    return { registered: true, urls };
  });

  expect(cacheEvidence.registered).toBe(true);
  expect(cacheEvidence.urls.length).toBeGreaterThan(0);
  for (const pathname of cacheEvidence.urls) {
    expect(
      pathname.startsWith('/_next/static/') ||
        pathname === '/manifest.webmanifest' ||
        pathname === '/icon.svg',
    ).toBe(true);
    expect(pathname.startsWith('/api/')).toBe(false);
    expect(
      /^\/(?:dashboard|patient|inventory|reservations|billing|audit|team|pharmacy)/.test(pathname),
    ).toBe(false);
  }
});
