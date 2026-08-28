import { expect, test } from '@playwright/test';

// Dashboard runtime-certification browser test only -- this is
// certification infrastructure, not application code, and complements
// (does not replace) apps/web/src/features/dashboard/dashboard-workspace.test.tsx,
// which mocks the API-client methods and proves component behavior in
// isolation. This test proves the real chain: browser -> Next frontend
// -> frontend API routes -> backend -> PostgreSQL/Redis, using a real
// authenticated session created through the real /login form -- not an
// injected cookie -- so real browser JavaScript execution and real
// hydration are genuinely exercised, not assumed.
//
// Required env vars (supplied by scripts/task5-smoke-test.mjs, which
// seeds the synthetic tenant/admin this test logs in as):
//   FRONTEND (also read by playwright.config.ts as baseURL)
//   DASHBOARD_CERT_ADMIN_EMAIL
//   DASHBOARD_CERT_ADMIN_PASSWORD

const adminEmail = requireEnv('DASHBOARD_CERT_ADMIN_EMAIL');
const adminPassword = requireEnv('DASHBOARD_CERT_ADMIN_PASSWORD');

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Dashboard browser certification requires ${name} to be set`);
  }
  return value;
}

test('authenticated Dashboard completes the real provider-dependent read path in a real browser', async ({
  page,
}) => {
  // Real login through the real form -- not an injected cookie. Field
  // labels are the same accessible, public labels a real user sees
  // (Work email / Password), confirmed directly
  // against apps/web/src/app/login/login-form.tsx -- no test-only
  // hidden DOM was needed or added.
  await page.goto('/login');
  await page.getByLabel('Work email').fill(adminEmail);
  await page.getByLabel('Password').fill(adminPassword);
  await page.getByRole('button', { name: 'Sign in securely' }).click();

  // Real navigation to the authenticated route, driven entirely by the
  // app's own client-side redirect after a successful login -- proves
  // the real login flow completed, not merely that a cookie exists.
  await page.waitForURL('**/dashboard', { timeout: 15_000 });

  // Unconditional shell -- confirms hydration started at all.
  await expect(page.getByText('Assigned-provider operations')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Operations overview' })).toBeVisible();

  // Provider discovery + selection: the assigned-provider <select> must
  // resolve to a real, non-empty provider id once the client-side fetch
  // completes -- proves getAssignedProviders() genuinely succeeded and
  // the Dashboard genuinely selected a real assigned provider, not that
  // the select element merely rendered.
  const providerSelect = page.getByLabel('Assigned provider');
  await expect(providerSelect).toBeVisible();
  await expect
    .poll(async () => providerSelect.inputValue(), {
      message: 'assigned-provider selection did not resolve to a real provider id',
      timeout: 15_000,
    })
    .not.toBe('');

  // Provider-dependent sections only render once providerId is truthy
  // (confirmed directly against dashboard-workspace.tsx's
  // `{providerId ? (...) : (...)}` gate) -- their presence here proves
  // the Dashboard actually reached the provider-selected branch in a
  // real browser, not merely that some HTML was returned.
  await expect(page.getByText('Stock · Current page')).toBeVisible();
  await expect(page.getByText('Reservations · Current page')).toBeVisible();

  // Stock read path: wait for the loading state to clear, then require
  // the absence of any error banner. A genuinely empty result (no
  // synthetic batches were necessarily seeded before this browser step)
  // is accepted as WORKING -- only a failed request is BROKEN. Checking
  // for the absence of all three possible error titles errorTitle() can
  // produce (confirmed directly against dashboard-workspace.tsx:
  // 'Your session must be verified' for 401, 'Access is restricted' for
  // 403, 'Stock is unavailable' as the fallback for anything else)
  // distinguishes a successful empty read from a failed one of any kind,
  // without requiring non-empty data.
  // Selector precision: PanelHeader and StatePanel both render their
  // title prop as an <h2> (confirmed directly against
  // dashboard-workspace.tsx). getByText() performs a case-insensitive,
  // whitespace-normalized SUBSTRING match by default, so a query for
  // 'Stock records' also matches the empty-state heading 'No stock
  // records' -- exactly the real CI strict-mode violation this fixes
  // ("resolved to 2 elements: heading 'Stock records', heading 'No
  // stock records'"). getByRole('heading', { name, exact: true })
  // matches only the element whose accessible name is exactly that
  // string, correctly excluding the empty-state heading while still
  // accepting a genuinely empty (but successful) read -- this does not
  // require non-empty data, and no Dashboard product UI was changed to
  // satisfy this test.
  await expect(page.getByText('Loading current-page stock…')).toHaveCount(0, { timeout: 15_000 });
  await expect(page.getByText('Your session must be verified')).toHaveCount(0);
  await expect(page.getByText('Access is restricted')).toHaveCount(0);
  await expect(page.getByText('Stock is unavailable')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Stock records', exact: true })).toBeVisible();

  // Reservation read path: identical reasoning and identical real
  // ambiguity (PanelHeader's 'Reservation records' vs StatePanel's 'No
  // reservation records'), fixed the same way.
  await expect(page.getByText('Loading current-page reservations…')).toHaveCount(0, {
    timeout: 15_000,
  });
  await expect(page.getByText('Your session must be verified')).toHaveCount(0);
  await expect(page.getByText('Access is restricted')).toHaveCount(0);
  await expect(page.getByText('Reservations are unavailable')).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: 'Reservation records', exact: true }),
  ).toBeVisible();

  // No client-side fatal error should have blocked the workspace --
  // Next.js's own error overlay/boundary text would appear if a render
  // exception occurred.
  await expect(page.getByText('Application error')).toHaveCount(0);
});
