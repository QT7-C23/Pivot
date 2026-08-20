import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { NewProjectDialog } from '../../src/renderer/components/new-project-dialog'
import { LocaleProvider } from '../../src/renderer/i18n/locale-context'

describe('Figma New Project dialog', () => {
  it('renders the current modal contract from real profiles without demo model data', () => {
    const html = renderToStaticMarkup(createElement(
      LocaleProvider,
      null,
      createElement(NewProjectDialog, {
        busy: false,
        error: null,
        isOpen: true,
        onBrowse: async () => null,
        onCancel: () => undefined,
        onCreate: async () => undefined,
        profiles: [{ adapterArgs: [], id: 'local', isSelected: true, label: 'Local Runtime' }],
      }),
    ))

    expect(html).toContain('data-figma-screen="597:5842"')
    expect(html).toContain('role="dialog"')
    expect(html).toContain('创建新项目')
    expect(html).toContain('项目名称')
    expect(html).toContain('项目位置')
    expect(html).toContain('Blank Project')
    expect(html).toContain('Local Runtime')
    expect(html).toContain('初始化 Git 仓库')
    expect(html).not.toContain('Claude 4 Sonnet')
  })

  it('is production-wired from Home and Projects without direct capabilities', () => {
    const root = path.join(process.cwd(), 'src/renderer')
    const app = readFileSync(path.join(root, 'pivot-app.tsx'), 'utf8')
    const now = readFileSync(path.join(root, 'components/now-workspace.tsx'), 'utf8')
    const projects = readFileSync(path.join(root, 'components/project-overview-workspace.tsx'), 'utf8')
    const dialog = readFileSync(path.join(root, 'components/new-project-dialog.tsx'), 'utf8')

    expect(app).toContain('<NewProjectDialog')
    expect(app).toContain('projectService.create')
    expect(now).toContain('onCreateProject')
    expect(projects).toContain('onCreateProject')
    expect(dialog).not.toMatch(/window\.pivot|ipcRenderer|node:fs|src\/main/)
  })
})
