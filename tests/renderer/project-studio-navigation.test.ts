import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { LocaleProvider } from '../../src/renderer/i18n/locale-context'
import { ProjectStudioChrome } from '../../src/renderer/components/project-studio-chrome'

describe('Figma V2 project studio chrome', () => {
  it('keeps the shared six-tab hierarchy for every project surface', () => {
    const html = renderToStaticMarkup(createElement(LocaleProvider, null, createElement(ProjectStudioChrome, {
      activeTab: 'diff',
      children: createElement('div', null, 'diff content'),
      figmaScreen: '818:16236',
      onSelectTab: () => undefined,
      onShare: () => undefined,
      projectName: 'Pivot Backend',
      workspaceName: 'My Project',
    })))

    expect(html).toContain('data-figma-screen="818:16236"')
    for (const tab of ['chat', 'tasks', 'diff', 'runs', 'preview', 'terminal']) expect(html).toContain(`data-project-tab="${tab}"`)
    expect(html).toContain('aria-current="page"')
    expect(html).toContain('diff content')
  })
})
