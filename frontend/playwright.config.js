import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser', fullyParallel: false, workers: 1, timeout: 45000, expect: { timeout: 12000 }, reporter: 'line',
  use: { baseURL: 'http://127.0.0.1:5501', reducedMotion: 'reduce', trace: 'off', screenshot: 'off' },
  projects: [
    { name: 'desktop', use: { browserName: 'chromium', viewport: { width: 1280, height: 900 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'], browserName: 'chromium', viewport: { width: 390, height: 844 } } },
  ],
  webServer: { command: 'node ../backend/scripts/demo.js', url: 'http://127.0.0.1:5501', reuseExistingServer: !process.env.CI, timeout: 180000 },
});
