import { defineConfig } from '@playwright/test'

export default defineConfig({
  forbidOnly: Boolean(process.env['CI']),
  fullyParallel: false,
  outputDir: 'test-results/playwright',
  reporter: 'line',
  retries: process.env['CI'] ? 1 : 0,
  testDir: 'tests/e2e',
  timeout: 30_000,
  workers: 1,
})
