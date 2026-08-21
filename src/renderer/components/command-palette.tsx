import { Command, FileText, FolderOpen, Search } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactElement } from 'react'
import {
  filterCommandPaletteItems,
  moveCommandPaletteSelection,
  type CommandPaletteAction,
  type CommandPaletteGroup,
  type CommandPaletteItem,
  type CommandPaletteLocale,
} from '../command-palette/command-palette-model'

interface CommandPaletteProps {
  isOpen: boolean
  isSearching: boolean
  items: readonly CommandPaletteItem[]
  locale?: CommandPaletteLocale
  onClose: () => void
  onExecute: (action: CommandPaletteAction) => void
  onQueryChange: (query: string) => void
}

const GROUP_ORDER: CommandPaletteGroup[] = ['recent', 'commands', 'files']

const COPY = {
  de: { close: 'Schließen', commands: 'BEFEHLE', empty: 'Keine passenden Befehle oder Dateien', files: 'DATEIEN', navigate: 'Navigieren', open: 'Öffnen', placeholder: 'Suchen oder Befehl ausführen…', recent: 'ZULETZT' },
  en: { close: 'Close', commands: 'COMMANDS', empty: 'No matching commands or files', files: 'FILES', navigate: 'Navigate', open: 'Open', placeholder: 'Search or run a command...', recent: 'RECENT' },
  ja: { close: '閉じる', commands: 'コマンド', empty: '一致するコマンドまたはファイルはありません', files: 'ファイル', navigate: '移動', open: '開く', placeholder: '検索またはコマンドを実行…', recent: '最近' },
  'zh-CN': { close: '关闭', commands: '命令', empty: '没有匹配的命令或文件', files: '文件', navigate: '选择', open: '打开', placeholder: '搜索或运行命令…', recent: '最近' },
} as const

export function CommandPalette({
  isOpen,
  isSearching,
  items,
  locale = 'en',
  onClose,
  onExecute,
  onQueryChange,
}: CommandPaletteProps): ReactElement | null {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const visibleItems = useMemo(() => filterCommandPaletteItems(items, query), [items, query])
  const copy = locale in COPY ? COPY[locale as keyof typeof COPY] : COPY.en

  useEffect(() => {
    if (!isOpen) return
    setQuery('')
    setSelectedIndex(0)
    onQueryChange('')
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus())
    return () => window.cancelAnimationFrame(frame)
  }, [isOpen, onQueryChange])

  useEffect(() => {
    if (selectedIndex < visibleItems.length) return
    setSelectedIndex(Math.max(0, visibleItems.length - 1))
  }, [selectedIndex, visibleItems.length])

  if (!isOpen) return null

  function updateQuery(value: string): void {
    setQuery(value)
    setSelectedIndex(0)
    onQueryChange(value)
  }

  function execute(item: CommandPaletteItem | undefined): void {
    if (item) onExecute(item.action)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      onClose()
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      setSelectedIndex((current) => moveCommandPaletteSelection(
        current,
        event.key === 'ArrowDown' ? 1 : -1,
        visibleItems.length,
      ))
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      execute(visibleItems[selectedIndex])
    }
  }

  return (
    <div
      className="pv-command-palette-backdrop"
      data-figma-screen="818:21302"
      onMouseDown={(event) => { if (event.currentTarget === event.target) onClose() }}
    >
      <section aria-label={copy.placeholder} aria-modal="true" className="pv-command-palette" role="dialog">
        <label className="pv-command-search">
          <Search aria-hidden="true" size={18} strokeWidth={1.7} />
          <input
            aria-activedescendant={visibleItems[selectedIndex] ? `pv-command-option-${selectedIndex}` : undefined}
            aria-autocomplete="list"
            aria-controls="pv-command-results"
            aria-expanded="true"
            aria-keyshortcuts="ArrowUp ArrowDown Enter Escape"
            aria-label={copy.placeholder}
            onChange={(event) => updateQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={copy.placeholder}
            ref={inputRef}
            role="combobox"
            spellCheck="false"
            value={query}
          />
          {isSearching ? <span aria-label="Searching" className="search-spinner" role="status" /> : <kbd>Esc</kbd>}
        </label>
        <div className="pv-command-results" id="pv-command-results" role="listbox">
          {visibleItems.length === 0 ? (
            <div className="pv-command-empty"><Search aria-hidden="true" size={22} /><span>{copy.empty}</span></div>
          ) : GROUP_ORDER.map((group) => {
            const grouped = visibleItems
              .map((item, index) => ({ index, item }))
              .filter(({ item }) => item.group === group)
            if (grouped.length === 0) return null
            return (
              <section className="pv-command-section" key={group}>
                <h2>{copy[group]}</h2>
                {grouped.map(({ index, item }) => (
                  <button
                    aria-selected={selectedIndex === index}
                    className={selectedIndex === index ? 'pv-command-row selected' : 'pv-command-row'}
                    data-command-id={item.id}
                    id={`pv-command-option-${index}`}
                    key={item.id}
                    onClick={() => execute(item)}
                    onMouseEnter={() => setSelectedIndex(index)}
                    role="option"
                    type="button"
                  >
                    <CommandIcon item={item} />
                    <span><strong>{item.label}</strong><small>{item.detail}</small></span>
                    {item.shortcut && <kbd>{item.shortcut}</kbd>}
                  </button>
                ))}
              </section>
            )
          })}
        </div>
        <footer className="pv-command-footer">
          <span><kbd>↑↓</kbd>{copy.navigate}</span><i />
          <span><kbd>↵</kbd>{copy.open}</span><i />
          <span><kbd>esc</kbd>{copy.close}</span>
        </footer>
      </section>
    </div>
  )
}

function CommandIcon({ item }: { item: CommandPaletteItem }): ReactElement {
  if (item.action.kind === 'open-file') return <FileText aria-hidden="true" size={16} />
  if (item.action.kind === 'open-session') return <FolderOpen aria-hidden="true" size={16} />
  return <Command aria-hidden="true" size={16} />
}
