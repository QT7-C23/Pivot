import { expect, test } from '@playwright/test'
import { _electron as electron } from 'playwright'
import { mkdir, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

test('V2 uses one first-run path and route-driven application shortcuts', async () => {
  const root = path.join(os.tmpdir(), `pivot-route-v2-${process.pid}-${Date.now()}`)
  await mkdir(root, { recursive: true })
  const app = await electron.launch({
    args: ['--no-sandbox', '--disable-gpu', '.'],
    cwd: path.resolve('.'),
    env: normalizedEnvironment({ PIVOT_DISABLE_HARDWARE_ACCELERATION: '1', PIVOT_E2E_USER_DATA: root }),
  })

  try {
    const page = await app.firstWindow()
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(error.message))

    await expect(page.locator('.welcome-entry-card')).toHaveCount(1)
    await expect(page.locator('.welcome-mode-grid')).toHaveCount(0)
    await page.locator('.welcome-entry-card .primary-button').click()

    await expect(page.locator('[data-figma-screen="63:190"]')).toBeVisible()
    await page.keyboard.press('Control+,')
    await expect(page.locator('.pv-settings-layout')).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(page.locator('[data-figma-screen="63:394"]')).toBeVisible()

    await page.keyboard.press('Control+1')
    await expect(page.locator('[data-figma-screen="63:190"]')).toBeVisible()

    await page.keyboard.press('Control+Backquote')
    await expect(page.locator('.terminal-layout')).toBeVisible()
    expect(pageErrors).toEqual([])
  } finally {
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
