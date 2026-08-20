import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { CommandPalette } from '../../src/renderer/components/command-palette'
import {
  createCommandPaletteItems,
  filterCommandPaletteItems,
  isCommandPaletteShortcut,
  moveCommandPaletteSelection,
} from '../../src/renderer/command-palette/command-palette-model'

describe('Figma command palette', () => {
  it('projects only real routes, sessions, and file search results', () => {
    const items = createCommandPaletteItems({
      fileResults: [{ name: 'attention.ts', path: 'D:\\Pivot\\src\\shared\\attention.ts', relativePath: 'src/shared/attention.ts' }],
      locale: 'en',
      sessions: [{
        createdAt: '2026-08-03T08:00:00.000Z', deletedAt: null, groupId: null, id: 'session-1',
        isFavorite: false, isPinned: false, isUnread: false, projectPath: 'D:\\Pivot',
        status: 'active', tags: [], title: 'Durable attention lifecycle', updatedAt: '2026-08-03T09:00:00.000Z',
      }],
    })

    expect(items).toContainEqual(expect.objectContaining({
      action: { kind: 'open-session', sessionId: 'session-1' },
      group: 'recent',
      label: 'Durable attention lifecycle',
    }))
    expect(items).toContainEqual(expect.objectContaining({
      action: { kind: 'open-file', path: 'D:\\Pivot\\src\\shared\\attention.ts' },
      detail: 'src/shared/attention.ts',
      group: 'files',
      label: 'attention.ts',
    }))
    expect(items).toContainEqual(expect.objectContaining({
      action: { kind: 'navigate', target: { route: 'settings' } },
      group: 'commands',
    }))
    expect(items.map((item) => item.label).join(' ')).not.toMatch(/auth_v1|production_auth|Run auth tests/i)
  })

  it('filters by normalized label, detail, and keywords while preserving group order', () => {
    const items = createCommandPaletteItems({ fileResults: [], locale: 'zh-CN', sessions: [] })

    expect(filterCommandPaletteItems(items, '模型 设置').map((item) => item.id)).toEqual(['command:settings'])
    expect(filterCommandPaletteItems(items, 'project').map((item) => item.id)).toContain('command:projects')
    expect(filterCommandPaletteItems(items, '')[0]?.group).toBe('commands')
  })

  it('wraps keyboard selection and recognizes only the primary K shortcut', () => {
    expect(moveCommandPaletteSelection(0, -1, 4)).toBe(3)
    expect(moveCommandPaletteSelection(3, 1, 4)).toBe(0)
    expect(moveCommandPaletteSelection(2, 1, 0)).toBe(0)
    expect(isCommandPaletteShortcut({ altKey: false, ctrlKey: true, key: 'k', metaKey: false })).toBe(true)
    expect(isCommandPaletteShortcut({ altKey: false, ctrlKey: false, key: 'K', metaKey: true })).toBe(true)
    expect(isCommandPaletteShortcut({ altKey: true, ctrlKey: true, key: 'k', metaKey: false })).toBe(false)
  })

  it('renders the current Figma dialog contract without demonstration content', () => {
    const items = createCommandPaletteItems({ fileResults: [], locale: 'en', sessions: [] })
    const html = renderToStaticMarkup(createElement(CommandPalette, {
      isOpen: true,
      isSearching: false,
      items,
      onClose: () => undefined,
      onExecute: () => undefined,
      onQueryChange: () => undefined,
    }))

    expect(html).toContain('data-figma-screen="597:5670"')
    expect(html).toContain('role="dialog"')
    expect(html).toContain('role="combobox"')
    expect(html).toContain('aria-keyshortcuts="ArrowUp ArrowDown Enter Escape"')
    expect(html).toContain('COMMANDS')
    expect(html).toContain('Navigate')
    expect(html).not.toMatch(/middleware\/auth|production_auth|API key config/i)
  })

  it('keeps the capability local to Renderer and wires the real shell trigger', () => {
    const root = path.resolve(process.cwd(), 'src/renderer')
    const component = readFileSync(path.join(root, 'components/command-palette.tsx'), 'utf8')
    const model = readFileSync(path.join(root, 'command-palette/command-palette-model.ts'), 'utf8')
    const shell = readFileSync(path.join(root, 'components/pivot-app-shell.tsx'), 'utf8')
    const app = readFileSync(path.join(root, 'pivot-app.tsx'), 'utf8')
    const keyboard = readFileSync(path.join(root, 'hooks/usePivotKeyboardNavigation.ts'), 'utf8')

    for (const source of [component, model]) {
      expect(source).not.toMatch(/window\.pivot|ipcRenderer|better-sqlite3|node:fs|src\/main/)
    }
    expect(shell).toContain('onOpenCommandPalette')
    expect(shell).toContain('onClick={onOpenCommandPalette}')
    expect(app).toContain('<CommandPalette')
    expect(app).toContain('usePivotKeyboardNavigation')
    expect(keyboard).toContain('isCommandPaletteShortcut')
    expect(app).toContain("action.kind === 'open-file'")
    expect(app).toContain("action.kind === 'open-session'")
    expect(app).toContain('query.length < 2 || !activeSessionId')
  })
})
