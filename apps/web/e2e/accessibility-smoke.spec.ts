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
