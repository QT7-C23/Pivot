import { useEffect } from 'react'
import type { ApplicationTheme } from '../../shared/application-preferences'
import type { Locale } from '../i18n/locale'
import { useAgentSignals } from './useAgentSignals'
import { useFileSignals } from './useFileSignals'
import { usePermissionSignals } from './usePermissionSignals'
import { usePlanSignals } from './usePlanSignals'
import { useTerminalSignals } from './useTerminalSignals'
import { useUpdateSignals } from './useUpdateSignals'

export function usePivotAppBootstrap(
  locale: Locale,
  setLocale: (locale: Locale) => void,
  setTheme: (theme: ApplicationTheme) => void,
): void {
  useAgentSignals()
  useFileSignals()
  usePermissionSignals()
  usePlanSignals()
  useTerminalSignals()
  useUpdateSignals()

  useEffect(() => {
    let disposed = false
    void import('../stores/application-preferences.store').then(async ({ useApplicationPreferencesStore }) => {
      const state = useApplicationPreferencesStore.getState()
      const preferences = state.preferences ?? await state.load()
      if (!disposed && preferences && preferences.values.locale !== locale) {
        setLocale(preferences.values.locale)
      }
      if (!disposed && preferences) setTheme(preferences.values.theme)
    }).catch(() => undefined)
    return () => { disposed = true }
  }, [locale, setLocale, setTheme])
}
