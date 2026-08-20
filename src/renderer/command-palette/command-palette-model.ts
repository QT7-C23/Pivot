import type { FileSearchEntry, SessionRecord } from '../../shared/types/domain'
import type { Locale } from '../i18n/locale'
import type { PivotNavigationTarget } from '../navigation/pivot-navigation'

export type CommandPaletteGroup = 'recent' | 'commands' | 'files'
export type CommandPaletteLocale = Locale

export type CommandPaletteAction =
  | { readonly kind: 'navigate'; readonly target: PivotNavigationTarget }
  | { readonly kind: 'open-file'; readonly path: string }
  | { readonly kind: 'open-session'; readonly sessionId: string }

export interface CommandPaletteItem {
  readonly action: CommandPaletteAction
  readonly detail: string
  readonly group: CommandPaletteGroup
  readonly id: string
  readonly keywords: readonly string[]
  readonly label: string
  readonly shortcut?: string
}

interface CommandPaletteSource {
  readonly fileResults: readonly FileSearchEntry[]
  readonly locale: CommandPaletteLocale
  readonly sessions: readonly SessionRecord[]
}

const COPY = {
  de: {
    automations: ['Automatisierungen öffnen', 'Pipelines, Trigger und Laufverlauf'],
    docs: ['Dokumente öffnen', 'Dateien und Projektdokumentation'],
    extensions: ['Installierte Erweiterungen öffnen', 'Konfigurierte lokale Ressourcen'],
    help: ['Hilfe öffnen', 'Hilfe und Tastenkürzel'],
    home: ['Start öffnen', 'Übersicht und aktuelle Arbeit'],
    marketplace: ['Marktplatz öffnen', 'Kostenlose verfügbare Ressourcen'],
    projects: ['Projekte öffnen', 'Projektübersicht und Sitzungen'],
    runtimes: ['Laufzeiten öffnen', 'Lokale und CLI-Laufzeiten'],
    sessions: ['Unterhaltung öffnen', 'Aktuelle Projektsitzung'],
    settings: ['Einstellungen öffnen', 'Modelle, Anbieter und Anwendungseinstellungen'],
    work: ['Arbeit öffnen', 'Pläne, Läufe und Ergebnisse'],
  },
  en: {
    automations: ['Open Automations', 'Pipelines, triggers, and run history'],
    docs: ['Open Docs', 'Files and project documentation'],
    extensions: ['Open Installed Extensions', 'Configured local resources'],
    help: ['Open Help', 'Help and keyboard shortcuts'],
    home: ['Open Home', 'Overview and current work'],
    marketplace: ['Open Marketplace', 'Available free resources'],
    projects: ['Open Projects', 'Project overview and sessions'],
    runtimes: ['Open Runtimes', 'Local and CLI runtimes'],
    sessions: ['Open Conversation', 'Current project session'],
    settings: ['Open Settings', 'Models, providers, and application settings'],
    work: ['Open Work', 'Plans, runs, and artifacts'],
  },
  ja: {
    automations: ['自動化を開く', 'パイプライン、トリガー、実行履歴'],
    docs: ['ドキュメントを開く', 'ファイルとプロジェクト文書'],
    extensions: ['インストール済み拡張を開く', '構成済みローカルリソース'],
    help: ['ヘルプを開く', 'ヘルプとキーボードショートカット'],
    home: ['ホームを開く', '概要と現在の作業'],
    marketplace: ['マーケットを開く', '利用可能な無料リソース'],
    projects: ['プロジェクトを開く', 'プロジェクト概要とセッション'],
    runtimes: ['ランタイムを開く', 'ローカルと CLI ランタイム'],
    sessions: ['会話を開く', '現在のプロジェクトセッション'],
    settings: ['設定を開く', 'モデル、プロバイダー、アプリ設定'],
    work: ['作業を開く', '計画、実行、成果物'],
  },
  'zh-CN': {
    automations: ['打开自动化', '流水线、触发器和运行历史'],
    docs: ['打开文档', '文件与项目文档'],
    extensions: ['打开已安装扩展', '已配置的本地资源'],
    help: ['打开帮助', '帮助与键盘快捷键'],
    home: ['打开主页', '概览与当前工作'],
    marketplace: ['打开市场', '可用的免费资源'],
    projects: ['打开项目', '项目概览与会话'],
    runtimes: ['打开运行时', '本地与 CLI 运行时'],
    sessions: ['打开对话', '当前项目会话'],
    settings: ['打开设置', '模型、Provider 与应用设置'],
    work: ['打开工作', '计划、运行与成果'],
  },
} as const

const COMMANDS: Array<{
  id: keyof typeof COPY.en
  shortcut?: string
  target: PivotNavigationTarget
}> = [
  { id: 'home', target: { route: 'now' } },
  { id: 'projects', shortcut: '⌘2', target: { route: 'projects' } },
  { id: 'sessions', shortcut: '⌘1', target: { route: 'sessions', sessionView: 'conversation' } },
  { id: 'work', target: { route: 'work' } },
  { id: 'automations', target: { route: 'automations' } },
  { id: 'docs', target: { route: 'docs' } },
  { id: 'marketplace', target: { route: 'marketplace' } },
  { id: 'extensions', target: { route: 'extensions' } },
  { id: 'settings', shortcut: '⌘,', target: { route: 'settings' } },
  { id: 'runtimes', target: { route: 'runtimes' } },
  { id: 'help', target: { route: 'help' } },
]

export function createCommandPaletteItems({
  fileResults,
  locale,
  sessions,
}: CommandPaletteSource): CommandPaletteItem[] {
  const copy = locale in COPY ? COPY[locale as keyof typeof COPY] : COPY.en
  const recent: CommandPaletteItem[] = [...sessions]
    .filter((session) => session.deletedAt === null)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, 5)
    .map((session) => ({
      action: { kind: 'open-session', sessionId: session.id },
      detail: shortPath(session.projectPath),
      group: 'recent',
      id: `session:${session.id}`,
      keywords: [session.projectPath, ...session.tags],
      label: session.title,
    }))
  const commands: CommandPaletteItem[] = COMMANDS.map(({ id, shortcut, target }) => ({
    action: { kind: 'navigate', target },
    detail: copy[id][1],
    group: 'commands',
    id: `command:${id}`,
    keywords: id === 'settings'
      ? [id, target.route, copy[id][0], copy[id][1], '模型', '设置', 'model', 'provider', 'settings']
      : [id, target.route, copy[id][0], copy[id][1]],
    label: copy[id][0],
    ...(shortcut ? { shortcut } : {}),
  }))
  const files: CommandPaletteItem[] = fileResults.slice(0, 20).map((file) => ({
    action: { kind: 'open-file', path: file.path },
    detail: file.relativePath,
    group: 'files',
    id: `file:${file.path}`,
    keywords: [file.path, file.relativePath],
    label: file.name,
  }))
  return [...recent, ...commands, ...files]
}

export function filterCommandPaletteItems(
  items: readonly CommandPaletteItem[],
  query: string,
  limit = 40,
): CommandPaletteItem[] {
  const tokens = normalize(query).split(' ').filter(Boolean)
  if (tokens.length === 0) return items.slice(0, limit)
  return items.filter((item) => {
    const searchable = normalize([item.label, item.detail, ...item.keywords].join(' '))
    return tokens.every((token) => searchable.includes(token))
  }).slice(0, limit)
}

export function moveCommandPaletteSelection(current: number, delta: number, length: number): number {
  if (length <= 0) return 0
  return (current + delta + length) % length
}

export function isCommandPaletteShortcut(input: {
  readonly altKey: boolean
  readonly ctrlKey: boolean
  readonly key: string
  readonly metaKey: boolean
}): boolean {
  return !input.altKey && (input.ctrlKey || input.metaKey) && input.key.toLowerCase() === 'k'
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, ' ')
}

function shortPath(value: string): string {
  return value.replaceAll('\\', '/').split('/').filter(Boolean).at(-1) ?? value
}
