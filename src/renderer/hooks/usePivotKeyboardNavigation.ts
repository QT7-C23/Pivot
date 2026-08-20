import { useEffect } from 'react'
import { isCommandPaletteShortcut } from '../command-palette/command-palette-model'
import {
  resolvePivotShortcut,
  type PivotNavigationTarget,
  type PivotRoute,
} from '../navigation/pivot-navigation'

export function usePivotKeyboardNavigation(options: {
  activeRoute: PivotRoute
  applyNavigationTarget(target: PivotNavigationTarget): void
  openCommandPalette(): void
}): void {
  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent): void => {
      if (isCommandPaletteShortcut(event)) {
        event.preventDefault()
        options.openCommandPalette()
        return
      }
      const target = resolvePivotShortcut({
        activeRoute: options.activeRoute,
        hasPrimaryModifier: event.ctrlKey || event.metaKey,
        key: event.key,
      })
      if (!target) return
      event.preventDefault()
      options.applyNavigationTarget(target)
    }
    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [options.activeRoute, options.applyNavigationTarget, options.openCommandPalette])
}
