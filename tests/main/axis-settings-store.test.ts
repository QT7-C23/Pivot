import { describe, expect, it } from 'vitest'
import { AxisSettingsStore } from '../../src/main/services/axis-settings-store'

describe('Axis settings store', () => {
  it('keeps Shadow mode disabled by default and persists explicit opt-in', () => {
    const settings = new AxisSettingsStore()
    expect(settings.isShadowEnabled()).toBe(false)
    settings.setShadowEnabled(true)
    expect(settings.isShadowEnabled()).toBe(true)
    settings.setShadowEnabled(false)
    expect(settings.isShadowEnabled()).toBe(false)
    settings.close()
  })

  it('keeps Axis dry-run execution independently disabled by default', () => {
    const settings = new AxisSettingsStore()
    expect(settings.isDryRunEnabled()).toBe(false)
    settings.setDryRunEnabled(true)
    expect(settings.isDryRunEnabled()).toBe(true)
    settings.setDryRunEnabled(false)
    expect(settings.isDryRunEnabled()).toBe(false)
    settings.close()
  })

  it('keeps real file execution independently disabled by default', () => {
    const settings = new AxisSettingsStore()
    expect(settings.isRealExecutionEnabled()).toBe(false)
    settings.setShadowEnabled(true)
    settings.setDryRunEnabled(true)
    expect(settings.isRealExecutionEnabled()).toBe(false)
    settings.setRealExecutionEnabled(true)
    expect(settings.isRealExecutionEnabled()).toBe(true)
    settings.setRealExecutionEnabled(false)
    expect(settings.isRealExecutionEnabled()).toBe(false)
    settings.close()
  })
})
