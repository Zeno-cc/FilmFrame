import { defineConfig } from '@playwright/test';
import preview from './playwright.preview.config';

export default defineConfig({
  ...preview,
  grep: /strip performance/,
  grepInvert: undefined,
  outputDir: './output/playwright/performance-results',
});
