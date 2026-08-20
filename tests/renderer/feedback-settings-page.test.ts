import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { LocaleProvider } from '../../src/renderer/i18n/locale-context'
import { FeedbackSettingsPage } from '../../src/renderer/components/feedback-settings-page'

describe('Figma Feedback settings page', () => {
  it('renders the current 577:2787 form without copying demonstration history', () => {
    const html = renderToStaticMarkup(createElement(
      LocaleProvider,
      null,
      createElement(FeedbackSettingsPage),
    ))
    expect(html).toContain('提交反馈')
    expect(html).toContain('Bug Report')
    expect(html).toContain('紧急')
    expect(html).toContain('保存反馈')
    expect(html).toContain('尚无本地反馈记录。')
    expect(html).not.toContain('Editor auto-complete is slow')
    expect(html).not.toContain('In Progress')
  })
})
