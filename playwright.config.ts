import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: './output/playwright/test-results',
  timeout: 60_000,
  // CI runners are several times slower than a development machine, and a 10s
  // expectation on an interaction or a React state change is not enough there:
  // the tag workflow failed twice on cases that pass locally in seconds.
  expect: { timeout: 20_000 },
  fullyParallel: false,
  grepInvert: /strip performance/,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4174',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
          args: ['--enable-unsafe-swiftshader'],
        },
      },
    },
    {
      name: 'firefox',
      testMatch: /browser-compatibility\.spec\.ts/,
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      testMatch: /browser-compatibility\.spec\.ts|darkroom-gallery\.spec\.ts/,
      use: { ...devices['Desktop Safari'] },
    },
  ],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4174',
    url: 'http://127.0.0.1:4174',
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
