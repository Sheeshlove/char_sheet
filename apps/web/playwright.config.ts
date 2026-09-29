import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://localhost:${PORT}`;
// В облачной среде Chromium предустановлен; локально Playwright использует свой.
const executablePath =
  process.env.PW_CHROMIUM_PATH ?? (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const databaseUrl = process.env.E2E_DATABASE_URL ?? 'postgres://party:party@localhost:5432/party_sheet_test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 60_000,
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL,
    locale: 'ru-RU',
    trace: 'retain-on-failure',
    launchOptions: executablePath ? { executablePath } : {},
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], launchOptions: executablePath ? { executablePath } : {} } },
  ],
  webServer: {
    command: `pnpm exec next start -p ${PORT}`,
    url: `${baseURL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      DATABASE_URL: databaseUrl,
      APP_URL: baseURL,
      UPLOAD_DIR: './test-results/uploads',
      NODE_ENV: 'production',
    },
  },
});
