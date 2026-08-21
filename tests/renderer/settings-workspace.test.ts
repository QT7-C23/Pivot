import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const rendererRoot = path.resolve(process.cwd(), 'src/renderer')

describe('Settings workspace structure', () => {
  it('exposes every section from the Figma settings navigation', () => {
    const contract = readFileSync(path.join(rendererRoot, 'components/settings-contract.ts'), 'utf8')
    const source = readFileSync(path.join(rendererRoot, 'components/settings-workspace-v2.tsx'), 'utf8')

    for (const id of ['general', 'appearance', 'providers', 'runtimes', 'agents', 'skills', 'commands', 'mcp', 'plugins', 'downloads', 'automations', 'privacy', 'data', 'updates', 'shortcuts', 'advanced', 'feedback', 'about']) {
      expect(contract).toContain(`id: '${id}'`)
      expect(source).toContain(`activeSection === '${id}'`)
    }
    expect(source).toContain('useLocale()')
    expect(source).toContain('getSettingsCopy(locale)')
  })

  it('keeps recoverable errors in the stage until dismissed', () => {
    const appSource = readFileSync(path.join(rendererRoot, 'pivot-app.tsx'), 'utf8')
    const bannerSource = readFileSync(path.join(rendererRoot, 'components/dismissible-error-banner.tsx'), 'utf8')

    expect(appSource).toContain('<AttentionCenter items={attentionItems}')
    expect(bannerSource).not.toContain('window.setTimeout')
    expect(bannerSource).toContain('pv-stage-attention')
    expect(bannerSource).toContain('aria-label="Dismiss error"')
  })

  it('keeps appearance focused on theme without an unplanned density preference', () => {
    const source = readFileSync(path.join(rendererRoot, 'components/settings-core-pages.tsx'), 'utf8')
    const css = readFileSync(path.join(rendererRoot, 'inspector.css'), 'utf8')

    expect(source).not.toContain('pivot:ui-density')
    expect(source).not.toContain('onDensityChange')
    expect(css).not.toContain('data-density')
  })

  it('presents providers as a catalog with progressive configuration and guarded deletion', () => {
    const source = readFileSync(path.join(rendererRoot, 'components/provider-settings-figma.tsx'), 'utf8')
    const overlays = readFileSync(path.join(rendererRoot, 'components/provider-connection-overlays.tsx'), 'utf8')

    expect(source).toContain('pv-provider-catalog')
    expect(source).toContain("type ProviderTab = 'connections' | 'routing' | 'monitor'")
    expect(source).toContain('saved.isActive')
    expect(source).toContain('onRemove')
    expect(source).toContain('!saved.isActive')
    expect(source).toContain('setShowAddConnection(true)')
    expect(source).toContain('<ProviderRemovalDialog')
    expect(source).toContain('<ProviderUndoBanner')
    for (const node of ['126:5889', '126:5922', '126:5945', '126:5969', '126:6003', '126:6015']) {
      expect(overlays).toContain(node)
    }
    expect(overlays).toContain('role="alertdialog"')
  })

  it('renders missing CLI executables as a recoverable Figma dialog instead of a raw remote error', () => {
    const app = readFileSync(path.join(rendererRoot, 'pivot-app.tsx'), 'utf8')
    const dialog = readFileSync(path.join(rendererRoot, 'components/runtime-executable-dialog.tsx'), 'utf8')
    const store = readFileSync(path.join(rendererRoot, 'stores/agent.store.ts'), 'utf8')

    expect(app).toContain('<RuntimeExecutableDialog')
    expect(dialog).toContain('data-figma-screen="71:2336"')
    expect(dialog).toContain('Rescan PATH')
    expect(dialog).toContain('Switch Runtime')
    expect(store).toContain('isMissingExecutableError')
    expect(store).toContain('unavailable: true')
  })

  it('maps every Figma settings screen and supports every application locale', () => {
    const workspace = readFileSync(path.join(rendererRoot, 'components/settings-workspace-v2.tsx'), 'utf8')
    const copy = readFileSync(path.join(rendererRoot, 'components/settings-copy.ts'), 'utf8')
    for (const node of ['818:4102', '818:4269', '1171:9637', '818:11341', '818:12358', '818:18002', '818:6686']) expect(workspace).toContain(node)
    for (const locale of ['zh-CN', 'en', 'ja', 'ko', 'de', 'fr', 'es', 'pt', 'ru']) expect(copy).toContain(locale)
  })

  it('matches the Figma General settings chrome and vertical rhythm', () => {
    const workspace = readFileSync(path.join(rendererRoot, 'components/settings-workspace-v2.tsx'), 'utf8')
    const controls = readFileSync(path.join(rendererRoot, 'components/settings-controls.tsx'), 'utf8')
    const css = readFileSync(path.join(rendererRoot, 'pivot-v2.css'), 'utf8')

    expect(workspace).toContain('pv-settings-nav-search')
    expect(workspace).not.toContain('aria-label={copy.back}')
    expect(workspace).not.toContain('<Icon aria-hidden="true" size={16}')
    expect(workspace).toContain('<strong>{copy.settings}</strong>')
    expect(workspace).toContain('<i aria-hidden="true" />')
    expect(workspace).toContain('visibleGroups')
    expect(workspace).toContain('No settings found')

    expect(controls).toContain('className="pv-settings-page-description"')
    expect(controls).not.toContain('<div><h1>{title}</h1>{description')
    expect(css).toContain('grid-template-columns: 260px minmax(0, 1fr)')
    expect(css).toContain('padding: 32px 48px')
    expect(css).toContain('.pv-settings-nav-search {\n  height: 32px;')
    expect(css).toContain('.pv-settings-page-description {')
    expect(css).toContain('.pv-settings-select { height: 27px;')
    expect(css).toContain('width: 140px')
    expect(css).toContain('width: 36px')
    expect(css).toContain('height: 20px')
  })

  it('tracks every designed provider state as an explicit Figma screen contract', () => {
    const workspace = readFileSync(path.join(rendererRoot, 'components/settings-workspace-v2.tsx'), 'utf8')
    for (const node of ['1171:9637', '1171:11360', '1405:10653', '1405:11063', '1405:11501', '1405:11877', '1406:11244', '1406:11690', '1406:12069', '1406:12440']) {
      expect(workspace).toContain(node)
    }
  })
})
