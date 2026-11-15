import { defineConfig, devices } from '@playwright/test'

/** Exercise the actual production bundle, including production-only i18n parsing. */
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'gnss-solver-production.spec.ts',
  outputDir: './tmp/gnss-solver-production-results',
  fullyParallel: true,
  timeout: 45_000,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4188', trace: 'on-first-retry' },
  projects: [{ name: 'chrome', use: { ...devices['Desktop Chrome'], channel: 'chrome' } }],
  webServer: {
    command:
      'pnpm exec vite preview --config vite.renderer.config.ts --host 127.0.0.1 --port 4188 --strictPort',
    url: 'http://127.0.0.1:4188',
    reuseExistingServer: false,
  },
})
