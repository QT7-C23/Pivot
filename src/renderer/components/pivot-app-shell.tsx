import { BookOpen, CircleHelp, FolderKanban, Home, Puzzle, Settings, Store, Zap, type LucideIcon } from 'lucide-react'
import type { ReactElement, ReactNode } from 'react'
import { useLocale } from '../i18n/locale-context'
import type { PivotRoute } from '../navigation/pivot-navigation'

interface NavigationItem {
  icon: LucideIcon
  label: Record<'de' | 'en' | 'ja' | 'zh-CN', string>
  route: PivotRoute
}

// Figma component 1337:9921 defines one stable global rail.
// Sessions, Work, Artifacts, and Runtimes remain reachable from their owning
// project/settings surfaces and are intentionally not duplicated here.
const PRIMARY_NAVIGATION: NavigationItem[] = [
  { route: 'now', icon: Home, label: { en: 'Home', 'zh-CN': '主页', ja: 'ホーム', de: 'Start' } },
  { route: 'projects', icon: FolderKanban, label: { en: 'Projects', 'zh-CN': '项目', ja: 'プロジェクト', de: 'Projekte' } },
  { route: 'automations', icon: Zap, label: { en: 'Auto', 'zh-CN': '自动', ja: '自動', de: 'Auto' } },
  { route: 'docs', icon: BookOpen, label: { en: 'Docs', 'zh-CN': '文档', ja: '文書', de: 'Doku' } },
]

const SECONDARY_NAVIGATION: NavigationItem[] = [
  { route: 'marketplace', icon: Store, label: { en: 'Market', 'zh-CN': '市场', ja: '市場', de: 'Markt' } },
  { route: 'extensions', icon: Puzzle, label: { en: 'Ext', 'zh-CN': '扩展', ja: '拡張', de: 'Ext' } },
  { route: 'settings', icon: Settings, label: { en: 'Settings', 'zh-CN': '设置', ja: '設定', de: 'Einstellungen' } },
  { route: 'help', icon: CircleHelp, label: { en: 'Help', 'zh-CN': '帮助', ja: 'ヘルプ', de: 'Hilfe' } },
]

export interface PivotAppShellProps {
  activeRoute: PivotRoute
  activityPanel?: ReactNode
  children: ReactNode
  commandPaletteOpen?: boolean
  contextSidebar?: ReactNode
  onNavigate: (route: PivotRoute) => void
  onOpenCommandPalette?: () => void
}

export function PivotAppShell({
  activeRoute,
  activityPanel,
  children,
  commandPaletteOpen = false,
  contextSidebar,
  onNavigate,
  onOpenCommandPalette = () => undefined,
}: PivotAppShellProps): ReactElement {
  const { locale } = useLocale()
  const labelLocale = locale === 'zh-CN' || locale === 'ja' || locale === 'de' ? locale : 'en'

  return (
    <main className={`pv-app-shell route-${activeRoute}`} data-active-route={activeRoute}>
      <header className="pv-titlebar">
        <div className="pv-titlebar-brand"><span aria-hidden="true" className="pv-brand-glyph" /><strong>PIVOT</strong></div>
        <button
          aria-expanded={commandPaletteOpen}
          aria-keyshortcuts="Meta+K Control+K"
          className="pv-command-palette-trigger"
          onClick={onOpenCommandPalette}
          type="button"
        >
          <kbd>⌘K</kbd>
          <span>{locale === 'zh-CN' ? '搜索或运行命令…' : 'Search or run a command...'}</span>
        </button>
      </header>
      <div className="pv-shell-body">
        <nav aria-label="Pivot" className="pv-global-rail" data-figma-component="1337:9921">
          <button aria-label="Profile" className="pv-rail-avatar" title="Profile" type="button">P</button>
          <div className="pv-rail-group">
            {PRIMARY_NAVIGATION.map((item) => (
              <RailButton active={activeRoute === item.route} item={item} key={item.route} labelLocale={labelLocale} onNavigate={onNavigate} />
            ))}
          </div>
          <div className="pv-rail-group pv-rail-bottom">
            {SECONDARY_NAVIGATION.map((item) => (
              <RailButton active={activeRoute === item.route} item={item} key={item.route} labelLocale={labelLocale} onNavigate={onNavigate} />
            ))}
          </div>
        </nav>
        <section className="pv-shell-main">
          <div className={`pv-shell-content ${contextSidebar ? 'has-context' : ''} ${activityPanel ? 'has-activity' : ''}`}>
            {contextSidebar && <div className="pv-context-sidebar">{contextSidebar}</div>}
            <section className="pv-studio-stage">{children}</section>
            {activityPanel && <div className="pv-activity-panel">{activityPanel}</div>}
          </div>
        </section>
      </div>
    </main>
  )
}

function RailButton({
  active,
  item,
  labelLocale,
  onNavigate,
}: {
  active: boolean
  item: NavigationItem
  labelLocale: 'de' | 'en' | 'ja' | 'zh-CN'
  onNavigate: (route: PivotRoute) => void
}): ReactElement {
  const Icon = item.icon
  const label = item.label[labelLocale]
  return (
    <button
      aria-current={active ? 'page' : undefined}
      aria-label={label}
      className={active ? 'pv-rail-button active' : 'pv-rail-button'}
      data-route={item.route}
      onClick={() => onNavigate(item.route)}
      title={label}
      type="button"
    >
      <Icon aria-hidden="true" size={20} strokeWidth={1.6} />
      <span>{label}</span>
    </button>
  )
}
