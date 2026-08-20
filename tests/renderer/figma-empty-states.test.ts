import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { ProjectOverviewWorkspace } from '../../src/renderer/components/project-overview-workspace'
import { AutomationWorkspace } from '../../src/renderer/components/automation-workspace'
import { ExtensionsEmptyWorkspace } from '../../src/renderer/components/extensions-empty-workspace'
import { LocaleProvider } from '../../src/renderer/i18n/locale-context'

describe('Figma production empty states', () => {
  it('renders No Projects node 597:6165 with only real reachable actions', () => {
    const html = renderToStaticMarkup(createElement(
      LocaleProvider,
      null,
      createElement(ProjectOverviewWorkspace, {
        activeProjectPath: '',
        onBrowseTemplates: () => undefined,
        onCreateProject: () => undefined,
        onImportProject: () => undefined,
        onOpenArtifact: () => undefined,
        onOpenTask: () => undefined,
        sessions: [],
        workItems: [],
      }),
    ))

    expect(html).toContain('class="pv-project-empty-state"')
    expect(html).toContain('data-figma-screen="597:6165"')
    expect(html).toContain('尚无项目')
    expect(html).toContain('创建新项目')
    expect(html).toContain('导入现有项目')
    expect(html).toContain('快速入门指南')
    expect(html).not.toContain('pv-project-dashboard')
  })

  it('keeps the existing data-backed overview for real Sessions', () => {
    const html = renderToStaticMarkup(createElement(
      LocaleProvider,
      null,
      createElement(ProjectOverviewWorkspace, {
        activeProjectPath: 'D:\\Pivot',
        onBrowseTemplates: () => undefined,
        onCreateProject: () => undefined,
        onImportProject: () => undefined,
        onOpenArtifact: () => undefined,
        onOpenTask: () => undefined,
        sessions: [{ createdAt: '2026-08-03T00:00:00.000Z', deletedAt: null, groupId: null, id: 'session-1', isFavorite: false, isPinned: false, isUnread: false, projectPath: 'D:\\Pivot', status: 'active', tags: [], title: 'Pivot', updatedAt: '2026-08-03T00:00:00.000Z' }],
        workItems: [],
      }),
    ))

    expect(html).toContain('data-figma-screen="63:394"')
    expect(html).toContain('pv-project-dashboard')
    expect(html).not.toContain('data-figma-screen="597:6165"')
  })

  it('wires Create, Import, and Templates to owned production routes', () => {
    const app = readFileSync(path.join(process.cwd(), 'src/renderer/pivot-app.tsx'), 'utf8')
    const main = readFileSync(path.join(process.cwd(), 'src/main/main.ts'), 'utf8')
    expect(app).toContain('onImportProject={() => void chooseProject()}')
    expect(app).toContain("onBrowseTemplates={() => navigate('marketplace')}")
    expect(main).toContain("'.pv-project-overview, .pv-project-empty-state'")
    expect(main).toContain("figmaScreen === '597:6165'")
  })

  it('renders No Automations node 597:6278 without pretending the scheduler exists', () => {
    const html = renderToStaticMarkup(createElement(
      LocaleProvider,
      null,
      createElement(AutomationWorkspace, {
        onBrowseTemplates: () => undefined,
        snapshot: { items: [], runtimeAvailable: false, selectedId: null },
      }),
    ))

    expect(html).toContain('data-figma-screen="597:6278"')
    expect(html).toContain('class="pv-automation-empty-state"')
    expect(html).toContain('尚无自动化')
    expect(html).toContain('创建自动化')
    expect(html).toContain('浏览模板')
    expect(html).toContain('disabled=""')
    expect(html.match(/class="pv-automation-example"/g)).toHaveLength(3)
    expect(html).not.toContain('pv-automation-inspector')
  })

  it('wires automation templates to the owned marketplace route', () => {
    const app = readFileSync(path.join(process.cwd(), 'src/renderer/pivot-app.tsx'), 'utf8')
    const main = readFileSync(path.join(process.cwd(), 'src/main/main.ts'), 'utf8')
    const smoke = readFileSync(path.join(process.cwd(), 'scripts/e2e-smoke.mjs'), 'utf8')
    expect(app).toContain("<AutomationWorkspace onBrowseTemplates={() => navigate('marketplace')}")
    expect(smoke).toContain("process.argv.includes('--automations')")
    expect(main).toContain("figmaScreen === '597:6278'")
  })

  it('renders No Extensions node 597:6403 with an honest empty inventory', () => {
    const html = renderToStaticMarkup(createElement(
      LocaleProvider,
      null,
      createElement(ExtensionsEmptyWorkspace, { onBrowseMarketplace: () => undefined }),
    ))

    expect(html).toContain('data-figma-screen="597:6403"')
    expect(html).toContain('class="pv-extensions-empty-state"')
    expect(html).toContain('尚无扩展')
    expect(html).toContain('浏览市场')
    expect(html).toContain('搜索已安装扩展')
    expect(html).not.toMatch(/install now|立即安装|suggested extensions|推荐扩展/i)
  })

  it('routes the Extensions empty state to the existing marketplace', () => {
    const app = readFileSync(path.join(process.cwd(), 'src/renderer/pivot-app.tsx'), 'utf8')
    const main = readFileSync(path.join(process.cwd(), 'src/main/main.ts'), 'utf8')
    const smoke = readFileSync(path.join(process.cwd(), 'scripts/e2e-smoke.mjs'), 'utf8')
    expect(app).toContain("<ExtensionsEmptyWorkspace onBrowseMarketplace={() => navigate('marketplace')} />")
    expect(app).not.toContain('surface="extensions"')
    expect(smoke).toContain("process.argv.includes('--extensions')")
    expect(main).toContain("figmaScreen === '597:6403'")
  })
})
