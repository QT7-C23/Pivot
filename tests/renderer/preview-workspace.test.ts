import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()

describe('Preview workspace contract', () => {
  it('exposes navigation, device viewports, loading feedback, and an isolated guest partition', () => {
    const source = readFileSync(path.join(root, 'src/renderer/components/preview-workspace.tsx'), 'utf8')

    expect(source).toContain('preview-workspace')
    expect(source).toContain('pivot-preview')
    expect(source).toContain("t('preview.back')")
    expect(source).toContain("t('preview.forward')")
    expect(source).toContain("t('preview.reload')")
    expect(source).toContain("t('preview.openExternal')")
    expect(source).toContain("t('preview.device.desktop')")
    expect(source).toContain("t('preview.device.tablet')")
    expect(source).toContain("t('preview.device.mobile')")
    expect(source).toContain('did-start-loading')
    expect(source).toContain('did-fail-load')
  })

  it('is a real session view rather than a separate IDE product or roadmap placeholder', () => {
    const app = readFileSync(path.join(root, 'src/renderer/pivot-app.tsx'), 'utf8')
    const store = readFileSync(path.join(root, 'src/renderer/stores/ui.store.ts'), 'utf8')

    expect(app).toContain('<PreviewWorkspace')
    expect(store).toContain("export type PreviewDevice = 'desktop' | 'tablet' | 'mobile'")
    expect(store).toContain("ChatSubmode = 'chat' | 'agent' | 'preview' | 'terminal'")
    expect(store).not.toContain('AppMode')
    expect(store).not.toContain('WorkbenchTab')
    expect(app).toContain("activeSessionView === 'preview'")
  })
})
