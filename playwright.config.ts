import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e', timeout: 120000, workers: 1,
  use: { baseURL: 'http://127.0.0.1:3100', headless: true, trace: 'retain-on-failure' },
  webServer: [
    { command: 'node --import tsx tests/helpers/browser-server.ts', url: 'http://127.0.0.1:3101/v1/config', timeout: 60000 },
    { command: 'node node_modules/next/dist/bin/next dev apps/voter-web --hostname 127.0.0.1 --port 3100', url: 'http://127.0.0.1:3100', env: { NEXT_PUBLIC_API_URL: 'http://127.0.0.1:3101' }, timeout: 120000 },
  ],
});
