import { defineConfig } from '@playwright/test';
const port=process.env.UMA_TEST_PORT??'5173';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  // Each real-data page loads the full source pack and runs a recommendation
  // worker. Bound concurrent pages so the source-data regressions stay stable.
  workers: 2,
  reporter: 'list',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    // Use the installed browser; no browser download is needed for this Windows workspace.
    channel: process.env.PLAYWRIGHT_CHANNEL ?? 'msedge',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile', use: { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true } },
  ],
  webServer: {
    command: `npm run dev -- --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: !process.env.CI,
  },
});
