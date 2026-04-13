// @ts-check
const { defineConfig, devices } = require('@playwright/test')
const path = require('path')

const backendDir = path.join(__dirname, 'backend')
const frontendDir = path.join(__dirname, 'frontend')

module.exports = defineConfig({
  testDir: './e2e',
  timeout: 60_000,          // generous for WebSocket analysis
  expect: { timeout: 15_000 },
  fullyParallel: false,      // sequential — shared test DB
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'on-failure' }]],

  use: {
    baseURL: 'http://localhost:3001',
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: [
    {
      // Backend: use a separate E2E database so tests never touch chess_games.db
      command: `CHESS_DB=chess_e2e.db ${backendDir}/venv/bin/uvicorn main:app --host 0.0.0.0 --port 9001`,
      cwd: backendDir,
      port: 9001,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      command: 'npm run dev',
      cwd: frontendDir,
      port: 3001,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],
})
