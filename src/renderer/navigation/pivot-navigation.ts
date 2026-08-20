export type PivotRoute =
  | 'now'
  | 'sessions'
  | 'projects'
  | 'work'
  | 'artifacts'
  | 'automations'
  | 'docs'
  | 'runtimes'
  | 'marketplace'
  | 'extensions'
  | 'settings'
  | 'help'

export type SessionView = 'conversation' | 'editor' | 'preview' | 'terminal'

export interface PivotNavigationTarget {
  readonly route: PivotRoute
  readonly sessionView?: SessionView
}

export interface PivotShortcutInput {
  readonly activeRoute: PivotRoute
  readonly hasPrimaryModifier: boolean
  readonly key: string
}

export function resolvePivotShortcut({
  activeRoute,
  hasPrimaryModifier,
  key,
}: PivotShortcutInput): PivotNavigationTarget | null {
  if (key === 'Escape') return activeRoute === 'settings' ? { route: 'projects' } : null
  if (!hasPrimaryModifier) return null
  if (key === ',') return { route: 'settings' }
  if (key === '1') return { route: 'sessions', sessionView: 'conversation' }
  if (key === '2') return { route: 'projects' }
  if (key === '`') return { route: 'sessions', sessionView: 'terminal' }
  return null
}
