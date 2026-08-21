import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { ProjectOverviewWorkspace } from '../../src/renderer/components/project-overview-workspace'
import { AutomationWorkspace } from '../../src/renderer/components/automation-workspace-v2'
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

  it('renders the current Automations home without copying Figma demo data', () => {
    const html = renderToStaticMarkup(createElement(
      LocaleProvider,
      null,
      createElement(AutomationWorkspace, {
        onBrowseTemplates: () => undefined,
        snapshot: { items: [], runtimeAvailable: false, selectedId: null },
      }),
    ))

    expect(html).toContain('data-figma-screen="1499:11725"')
    expect(html).toContain('class="pv-automation-zero"')
    expect(html).toContain('No automations yet')
    expect(html).toContain('disabled=""')
    expect(html).not.toContain('Auto-format on save')
    expect(html).not.toContain('156')
  })

  it('wires automation templates to the owned marketplace route', () => {
    const app = readFileSync(path.join(process.cwd(), 'src/renderer/pivot-app.tsx'), 'utf8')
    const main = readFileSync(path.join(process.cwd(), 'src/main/main.ts'), 'utf8')
    const smoke = readFileSync(path.join(process.cwd(), 'scripts/e2e-smoke.mjs'), 'utf8')
    expect(app).toContain("<AutomationWorkspace onBrowseTemplates={() => navigate('marketplace')}")
    expect(smoke).toContain("process.argv.includes('--automations')")
    expect(main).toContain("figmaScreen === '1499:11725'")
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

  it('routes Toolkit to the production marketplace-backed inventory through a real empty-state action', () => {
    const app = readFileSync(path.join(process.cwd(), 'src/renderer/pivot-app.tsx'), 'utf8')
    const main = readFileSync(path.join(process.cwd(), 'src/main/main.ts'), 'utf8')
    const page = readFileSync(path.join(process.cwd(), 'src/renderer/components/plugin-ecosystem-page.tsx'), 'utf8')
    const smoke = readFileSync(path.join(process.cwd(), 'scripts/e2e-smoke.mjs'), 'utf8')
    expect(app).toContain("onBrowseMarketplace={() => navigate('marketplace')}")
    expect(app).toContain('surface="extensions"')
    expect(page).toContain('onBrowseMarketplace')
    expect(page).toContain('Browse Marketplace')
    expect(smoke).toContain("process.argv.includes('--extensions')")
    expect(main).toContain("figmaScreen === '1476:8909'")
    expect(main).toContain('browseButton?.click()')
    expect(main).toContain("Boolean(await waitFor('.surface-marketplace'))")
    expect(main).not.toContain('browseEnabled: true')
    expect(main).not.toContain('navigatedToMarketplace = true')
  })
})
