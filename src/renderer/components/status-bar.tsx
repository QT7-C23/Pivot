import { PanelRightClose, PanelRightOpen } from 'lucide-react'
import type { ReactElement } from 'react'
import type { SessionRecord } from '../../shared/types/domain'
import { useLocale } from '../i18n/locale-context'
import type { SessionView } from '../navigation/pivot-navigation'

interface StatusBarProps {
  activeFilePath: string | null
  activeSession: SessionRecord | null
  agentLabel: string
  agentState: string
  isAgentPanelCollapsed: boolean
  messagesCount: number
  onToggleAgentPanel: () => void
  terminalsCount: number
  sessionView: SessionView
}

export function StatusBar({
  activeFilePath,
  activeSession,
  agentLabel,
  agentState,
  isAgentPanelCollapsed,
  messagesCount,
  onToggleAgentPanel,
  terminalsCount,
  sessionView,
}: StatusBarProps): ReactElement {
  const { t } = useLocale()
  return (
    <footer className="pivot-statusbar">
      <button className={`status-agent agent-${agentState}`} onClick={onToggleAgentPanel} type="button">
        <span aria-hidden="true" className="status-dot" />
        <span>{agentState}</span>
        {isAgentPanelCollapsed ? <PanelRightOpen size={13} /> : <PanelRightClose size={13} />}
      </button>
      <span>{agentLabel}</span>
      <span>{t('status.messages', { count: messagesCount })}</span>
      <span>{t('status.terminals', { count: terminalsCount })}</span>
      <span>{activeSession?.title ?? t('status.noSession')}</span>
      <span>{sessionView}</span>
      <span>{activeFilePath ? shortFileName(activeFilePath) : t('status.noFile')}</span>
    </footer>
  )
}

function shortFileName(path: string): string {
  return path.split(/[\\/]/).at(-1) ?? path
}
