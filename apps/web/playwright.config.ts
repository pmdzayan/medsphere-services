import { defineConfig } from '@playwright/test';

// Dashboard runtime-certification browser test config only -- this is
// certification infrastructure, not application code. Introduced because
// the repository has no existing browser-testing framework (confirmed by
// searching package.json/pnpm-workspace.yaml/apps/web/package.json for
// playwright/puppeteer/cypress before adding this: zero matches).
//
// FRONTEND must point at a genuinely running instance of the frontend
// (started by the CI workflow / a real dev server) -- this config never
// starts its own server, since the Dashboard certification's whole point
// is to prove the real frontend -> backend -> PostgreSQL/Redis chain,
// not an isolated preview build.
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL: process.env.FRONTEND ?? 'http://localhost:3001',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
