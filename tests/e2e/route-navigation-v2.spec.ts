import { expect, test } from '@playwright/test'
import { _electron as electron } from 'playwright'
import { mkdir, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

test('V2 uses one first-run path and route-driven application shortcuts', async () => {
  const root = path.join(os.tmpdir(), `pivot-route-v2-${process.pid}-${Date.now()}`)
  await mkdir(root, { recursive: true })
  let app = await electron.launch({
    args: ['--no-sandbox', '--disable-gpu', '.'],
    cwd: path.resolve('.'),
    env: normalizedEnvironment({ PIVOT_DISABLE_HARDWARE_ACCELERATION: '1', PIVOT_E2E_USER_DATA: root }),
  })

  try {
    const page = await app.firstWindow({ timeout: 10_000 })
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(error.message))

    await expect(page.locator('[data-figma-screen="1285:8199"] .welcome-entry-card')).toHaveCount(1, { timeout: 5_000 })
    await expect(page.locator('.welcome-mode-grid')).toHaveCount(0)
    await page.locator('.welcome-entry-card .primary-button').click()
    await expect(page.locator('[data-figma-screen="1291:8035"]')).toBeVisible({ timeout: 5_000 })
    await page.getByRole('button', { name: 'Finish Setup' }).click()
    await expect(page.locator('[data-figma-screen="1291:8129"]')).toBeVisible({ timeout: 5_000 })
    await page.getByRole('button', { name: 'Get Started' }).click()

    await expect(page.locator('[data-figma-screen="1026:8514"]')).toBeVisible()
    await page.keyboard.press('Control+,')
    await expect(page.locator('.pv-settings-layout')).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(page.locator('[data-figma-screen="597:6165"]')).toBeVisible()

    await page.keyboard.press('Control+1')
    await expect(page.locator('section.pv-project-studio[data-figma-screen="818:12754"]')).toBeVisible()

    await page.keyboard.press('Control+Backquote')
    await expect(page.locator('.terminal-layout')).toBeVisible()
    expect(pageErrors).toEqual([])

    await app.evaluate(({ app: electronApp }) => electronApp.exit(0))
    await app.close().catch(() => undefined)
    app = await electron.launch({
      args: ['--no-sandbox', '--disable-gpu', '.'],
      cwd: path.resolve('.'),
      env: normalizedEnvironment({ PIVOT_DISABLE_HARDWARE_ACCELERATION: '1', PIVOT_E2E_USER_DATA: root }),
    })
    const reopenedPage = await app.firstWindow({ timeout: 10_000 })
    await expect(reopenedPage.locator('.welcome-screen')).toHaveCount(0, { timeout: 5_000 })
    await expect(reopenedPage.locator('main.pv-app-shell')).toBeVisible()
  } finally {
    await app.evaluate(({ app: electronApp }) => electronApp.exit(0)).catch(() => undefined)
    await app.close().catch(() => undefined)
    await rm(root, { force: true, recursive: true })
  }
})

function normalizedEnvironment(extra: Record<string, string>): Record<string, string> {
  const entries = new Map<string, [string, string]>()
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) entries.set(key.toLowerCase(), [key, value])
  }
  for (const [key, value] of Object.entries(extra)) entries.set(key.toLowerCase(), [key, value])
  return Object.fromEntries(entries.values())
}
