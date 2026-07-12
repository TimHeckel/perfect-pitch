import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './cloud',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:8788',
    viewport: { width: 390, height: 844 },
  },
  projects: [{ name: 'chromium' }],
  webServer: {
    command: 'npm run build && npm run db:migrate:local && wrangler dev --local --port 8788 --var GOOGLE_CLIENT_ID:test-client --var GOOGLE_CLIENT_SECRET:test-secret',
    url: 'http://localhost:8788/api/health',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
