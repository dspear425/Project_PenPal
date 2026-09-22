import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, devices } from '@playwright/test'

const authA = process.env.OUTKIN_E2E_AUTH_A ?? 'playwright/.auth/user-a.json'
const authB = process.env.OUTKIN_E2E_AUTH_B ?? 'playwright/.auth/user-b.json'

const projects = [
  {
    name: 'public-chromium',
    testMatch: '**/public.smoke.spec.ts',
    use: { ...devices['Desktop Chrome'] },
  },
]

if (existsSync(resolve(authA))) {
  projects.push({
    name: 'member-a',
    testMatch: '**/member.smoke.spec.ts',
    use: { ...devices['Desktop Chrome'], storageState: authA },
  })
}

if (existsSync(resolve(authA)) && existsSync(resolve(authB))) {
  projects.push({
    name: 'connection-flow',
    testMatch: '**/connection-flow.spec.ts',
    use: { ...devices['Desktop Chrome'] },
  })
}

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.OUTKIN_E2E_BASE_URL ?? 'https://joinoutkin.com',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects,
})
