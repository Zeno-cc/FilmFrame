import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: './output/playwright/preview-results',
  // These diagnostics load development .ts modules or the dev asset route.
  // Run the same cases with the default development Playwright configuration.
  grepInvert: /CineStill GPU allocation failures|CineStill WebGL2 headroom|physical portrait frame restores|physical five-frame strips preserve|physical single-frame budget rejects|straightened strip imprints|manual landscape-to-portrait rotation|physical main-thread fallback|Pro 400H supports full physical|Pro 400H hole presence|push variants are separate stocks|strip performance/,
  timeout: 180_000,
  expect: { timeout: 90_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4175',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [{
    name: 'chromium',
    use: {
      browserName: 'chromium',
      launchOptions: {
        ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
        args: ['--enable-unsafe-swiftshader'],
      },
    },
  }],
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4175',
    url: 'http://127.0.0.1:4175',
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
