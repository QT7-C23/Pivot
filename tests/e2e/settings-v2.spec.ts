import { expect, test } from '@playwright/test'
import { _electron as electron } from 'playwright'
import { mkdir, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

test('Settings V2 exposes the complete Figma navigation and stable provider layout', async () => {
  const root = path.join(os.tmpdir(), `pivot-settings-v2-${process.pid}-${Date.now()}`)
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
    await page.evaluate(() => {
      localStorage.setItem('pivot:onboarding-complete', '1')
      localStorage.setItem('pivot:language', 'en')
    })
    await page.reload()
    await page.locator('[data-route="settings"]').click()

    const settings = page.locator('.pv-settings-layout')
    await expect(settings).toBeVisible()
    await expect(page.locator('.pv-settings-navigation nav button')).toHaveCount(17)
    await expect(page.locator('.pv-settings-navigation nav button > svg')).toHaveCount(17)
    await expect(page.locator('.pv-settings-content')).toContainText('General')
    await expect(page.locator('.pv-settings-page-header p')).toContainText('Configure Pivot language')

    const sidebar = await page.locator('.pv-settings-navigation').boundingBox()
    expect(sidebar?.width).toBeCloseTo(260, 0)

    const titlebar = await page.locator('.pv-titlebar').boundingBox()
    const rail = await page.locator('.pv-global-rail').boundingBox()
    expect(titlebar?.height).toBeCloseTo(44, 0)
    expect(rail?.width).toBeCloseTo(52, 0)

    const settingsSearch = page.getByRole('search').getByRole('textbox')
    await settingsSearch.fill('provider')
    await expect(page.locator('.pv-settings-navigation nav button')).toHaveCount(1)
    await expect(page.locator('.pv-settings-navigation nav button')).toContainText('Models & Providers')
    await settingsSearch.fill('not-a-setting')
    await expect(page.locator('.pv-settings-search-empty')).toBeVisible()
    await settingsSearch.fill('')
    await expect(page.locator('.pv-settings-navigation nav button')).toHaveCount(17)

    const navigationLabels = await page.locator('.pv-settings-navigation nav button').allTextContents()
    for (const label of navigationLabels) {
      await page.locator('.pv-settings-navigation nav button', { hasText: label }).click()
      if (label === 'Models & Providers') {
        await expect(page.locator('.pv-provider-tabs')).toBeVisible()
      } else {
        await expect(page.locator('.pv-settings-content > *').first()).toBeVisible()
      }
      const horizontallyOverflowing = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
      expect(horizontallyOverflowing, `${label} must not overflow the application horizontally`).toBe(false)
    }

    await page.locator('.pv-settings-navigation nav button', { hasText: 'Models & Providers' }).click()
    await expect(page.locator('.pv-provider-tabs')).toBeVisible()
    await expect(page.locator('.pv-provider-page-intro p')).toContainText('Connect model services')
    await expect(page.locator('.pv-provider-catalog')).toBeVisible()
    await expect(page.locator('.pv-provider-detail')).toBeVisible()
    await expect(page.locator('.pv-provider-tabs button')).toHaveCount(3)

    await page.locator('.pv-provider-catalog > header button').click()
    const addDialog = page.locator('.pv-connection-dialog')
    await expect(addDialog).toBeVisible()
    await expect(page.getByRole('dialog', { name: 'Add Connection' })).toBeVisible()
    await expect(page.locator('.pv-modal-backdrop')).toHaveAttribute('data-figma-screen', '126:5889')
    await addDialog.getByRole('button', { name: 'Next' }).click()
    await expect(page.locator('.pv-modal-backdrop')).toHaveAttribute('data-figma-screen', '126:5922')
    await expect(page.getByLabel('API Key')).toBeVisible()
    await addDialog.getByRole('button', { name: 'Close' }).click()
    await expect(addDialog).toBeHidden()

    const catalog = await page.locator('.pv-provider-catalog').boundingBox()
    const detail = await page.locator('.pv-provider-detail').boundingBox()
    expect(catalog?.width).toBeCloseTo(362, 0)
    expect(catalog && detail && catalog.x + catalog.width <= detail.x + 1).toBe(true)
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
