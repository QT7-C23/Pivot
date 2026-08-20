import { describe, expect, it } from 'vitest'
import { resolvePivotShortcut } from '../../src/renderer/navigation/pivot-navigation'

describe('Pivot route navigation contract', () => {
  it('maps application shortcuts to routes and narrow session views', () => {
    expect(resolvePivotShortcut({ activeRoute: 'now', hasPrimaryModifier: true, key: ',' })).toEqual({
      route: 'settings',
    })
    expect(resolvePivotShortcut({ activeRoute: 'now', hasPrimaryModifier: true, key: '1' })).toEqual({
      route: 'sessions',
      sessionView: 'conversation',
    })
    expect(resolvePivotShortcut({ activeRoute: 'now', hasPrimaryModifier: true, key: '2' })).toEqual({
      route: 'projects',
    })
    expect(resolvePivotShortcut({ activeRoute: 'projects', hasPrimaryModifier: true, key: '`' })).toEqual({
      route: 'sessions',
      sessionView: 'terminal',
    })
  })

  it('only treats Escape as navigation while Settings is active', () => {
    expect(resolvePivotShortcut({ activeRoute: 'settings', hasPrimaryModifier: false, key: 'Escape' })).toEqual({
      route: 'projects',
    })
    expect(resolvePivotShortcut({ activeRoute: 'projects', hasPrimaryModifier: false, key: 'Escape' })).toBeNull()
    expect(resolvePivotShortcut({ activeRoute: 'now', hasPrimaryModifier: false, key: '1' })).toBeNull()
  })
})
