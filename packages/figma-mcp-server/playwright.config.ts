import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright 仅在本地手动触发，依赖 Figma 桌面登录态。
 * 通过 `pnpm test:e2e` 或 `pnpm test:e2e --update` 运行。
 * CI 默认跳过（package.json scripts.test 不调起此配置）。
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [['list'], ['html', { outputFolder: 'e2e/results', open: 'never' }]],
  outputDir: 'e2e/diffs',
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure'
  },
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.01
    }
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ]
});
