import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('IDE heavy-module loading boundary', () => {
  it('loads editor and diff workspaces only behind a Suspense boundary', () => {
    const app = readFileSync(path.resolve('src/renderer/pivot-app.tsx'), 'utf8')
    const loading = readFileSync(path.resolve('src/renderer/components/workspace-loading-states.tsx'), 'utf8')

    expect(app).not.toContain("import { EditorWorkspace } from './components/editor-workspace'")
    expect(app).not.toContain("import { FileReviewWorkspace } from './components/file-review-workspace'")
    expect(app).toContain("import('./components/editor-workspace')")
    expect(app).toContain("import('./components/file-review-workspace')")
    expect(app).toContain('EditorLoadingState')
    expect(loading).toContain('editor-loading-state')
    expect(app).toContain('<Suspense')
  })

  it('keeps settings and its strict preference validators out of the initial renderer entry', () => {
    const app = readFileSync(path.resolve('src/renderer/pivot-app.tsx'), 'utf8')
    const bootstrap = readFileSync(path.resolve('src/renderer/hooks/usePivotAppBootstrap.ts'), 'utf8')

    expect(app).not.toContain("import { SettingsWorkspace } from './components/settings-workspace'")
    expect(app).not.toContain("import { useApplicationPreferencesStore } from './stores/application-preferences.store'")
    expect(app).toContain("import('./components/settings-workspace')")
    expect(app).toContain('usePivotAppBootstrap')
    expect(bootstrap).toContain("import('../stores/application-preferences.store')")
  })

  it('enforces a separate budget for the initial renderer entry', () => {
    const verifier = readFileSync(path.resolve('scripts/verify-performance.mjs'), 'utf8')

    expect(verifier).toContain('maxInitialRendererChunk')
    expect(verifier).toContain('initialRendererChunk')
  })
})
