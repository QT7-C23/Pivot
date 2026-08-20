import { describe, expect, it } from 'vitest'
import {
  DEFAULT_LOCALE,
  MESSAGE_KEYS,
  SUPPORTED_LOCALES,
  getLocaleOptions,
  normalizeLocale,
  translate,
} from '../../src/renderer/i18n/locale'

describe('renderer locale contract', () => {
  it('advertises the nine product-planned locales with explicit beta status', () => {
    expect(SUPPORTED_LOCALES).toEqual(['zh-CN', 'en', 'ja', 'ko', 'de', 'fr', 'es', 'pt', 'ru'])
    expect(getLocaleOptions().map((option) => option.value)).toEqual(SUPPORTED_LOCALES)
    expect(getLocaleOptions().filter((option) => option.label.includes('Beta'))).toHaveLength(7)

    for (const locale of SUPPORTED_LOCALES) {
      for (const key of MESSAGE_KEYS) {
        expect(translate(locale, key), `${locale}:${key}`).not.toBe('')
      }
    }
  })

  it('normalizes regional tags and falls back for unsupported languages', () => {
    expect(normalizeLocale('zh-Hans-CN')).toBe('zh-CN')
    expect(normalizeLocale('en-US')).toBe('en')
    expect(normalizeLocale('ja-JP')).toBe('ja')
    expect(normalizeLocale('de-DE')).toBe('de')
    expect(normalizeLocale('it-IT')).toBe(DEFAULT_LOCALE)
    expect(normalizeLocale(null)).toBe(DEFAULT_LOCALE)
  })

  it('translates settings and interpolates runtime values', () => {
    expect(translate('zh-CN', 'settings.language.description')).toContain('立即应用')
    expect(translate('en', 'settings.language.description')).toContain('immediately')
    expect(translate('en', 'session.deleted', { title: 'Refactor auth' })).toBe('Deleted Refactor auth')
    expect(translate('zh-CN', 'session.deleted', { title: '重构认证' })).toBe('已删除 重构认证')
    for (const locale of SUPPORTED_LOCALES.filter((value) => value !== 'en')) {
      expect(translate(locale, 'settings.title'), locale).not.toBe(translate('en', 'settings.title'))
      for (const key of ['settings.model.title', 'settings.language.title', 'title.askPivot', 'welcome.subtitle', 'mode.agent'] as const) {
        expect(translate(locale, key), `${locale}:${key}`).not.toBe(translate('en', key))
      }
    }
  })
})
