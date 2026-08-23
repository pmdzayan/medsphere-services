import { configDefaults, defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  esbuild: {
    jsx: 'automatic',
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    // e2e/** is Playwright's exclusive domain (Dashboard browser runtime
    // certification) -- both tools default to matching *.spec.ts, so
    // without this exclusion Vitest also tries to run the Playwright
    // spec directly (and fails, since it depends on env vars only the
    // Playwright runner/CI step supplies).
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
