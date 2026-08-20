import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react'
import {
  DEFAULT_LOCALE,
  normalizeLocale,
  translate,
  type Locale,
  type MessageKey,
} from './locale'

const STORAGE_KEY = 'pivot:language'

interface LocaleContextValue {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (key: MessageKey, values?: Readonly<Record<string, string | number>>) => string
}

const LocaleContext = createContext<LocaleContextValue | null>(null)

export function LocaleProvider({ children }: { children: ReactNode }): ReactElement {
  const [locale, setLocale] = useState<Locale>(() => readInitialLocale())

  useEffect(() => {
    document.documentElement.lang = locale
    document.documentElement.dataset.locale = locale
    window.localStorage.setItem(STORAGE_KEY, locale)
  }, [locale])

  const t = useCallback(
    (key: MessageKey, values?: Readonly<Record<string, string | number>>) => translate(locale, key, values),
    [locale],
  )
  const value = useMemo(() => ({ locale, setLocale, t }), [locale, t])
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}

export function useLocale(): LocaleContextValue {
  const value = useContext(LocaleContext)
  if (!value) throw new Error('useLocale must be used within LocaleProvider')
  return value
}

export function readInitialLocale(): Locale {
  if (typeof window === 'undefined') return DEFAULT_LOCALE
  return normalizeLocale(window.localStorage.getItem(STORAGE_KEY))
}
