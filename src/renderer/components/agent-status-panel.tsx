import { Check, Circle, Clock3, ShieldAlert, Square, X } from 'lucide-react'
import { useState, type ReactElement } from 'react'
import type { PermissionDecision, PermissionRequest } from '../../shared/types/domain'
import { useLocale } from '../i18n/locale-context'
import type { AgentOperation } from '../stores/agent.store'

export type PermissionRisk = 'low' | 'medium' | 'high'

interface AgentStatusPanelProps {
  abortStream: () => Promise<void>
  agentLabel: string
  agentState: string
  currentTask: string | null
  isStreaming: boolean
  operations: AgentOperation[]
  permissionRequests: PermissionRequest[]
  streamPhase: 'thinking' | 'writing' | 'tool_use' | null
  tokenUsage: { in: number; out: number }
}

export function AgentStatusPanel({
  abortStream,
  agentLabel,
  agentState,
  currentTask,
  isStreaming,
  operations,
  permissionRequests,
  streamPhase,
  tokenUsage,
}: AgentStatusPanelProps): ReactElement {
  const { t } = useLocale()
  const totalTokens = tokenUsage.in + tokenUsage.out
  const [activeTab, setActiveTab] = useState<'activity' | 'inspector'>('inspector')

  return (
    <aside aria-label={t('agent.status')} className="pv-conversation-inspector" data-figma-region="conversation-inspector">
        <header>
          <button className={activeTab === 'activity' ? 'active' : ''} onClick={() => setActiveTab('activity')} type="button">Activity</button>
          <button className={activeTab === 'inspector' ? 'active' : ''} onClick={() => setActiveTab('inspector')} type="button">Inspector</button>
        </header>
        {activeTab === 'activity' ? (
          <div className="pv-conversation-activity">
            {operations.length === 0 ? <p>{t('agent.operationsEmpty')}</p> : operations.map((operation, index) => (
              <div key={operation.id}><small>{formatOperationIndex(index)}</small>{operation.status === 'done' ? <Check size={12} /> : <Circle size={12} />}<span>{operation.description}</span></div>
            ))}
          </div>
        ) : (
          <div className="pv-conversation-properties">
            <InfoLine label="Model" value={agentLabel} />
            <InfoLine label="State" value={agentState} />
            <InfoLine label="Task" value={currentTask ?? t('agent.ready')} />
            <InfoLine label="Phase" value={streamPhase ?? 'idle'} />
            <InfoLine label="Tokens" value={formatNumber(totalTokens)} />
            {permissionRequests.length > 0 && <div className="pv-conversation-permission"><ShieldAlert size={13} /><span>{t('agent.permissionRequests', { count: permissionRequests.length })}</span></div>}
          </div>
        )}
        {isStreaming && <button className="pv-conversation-stop" onClick={() => void abortStream()} type="button"><Square size={12} />{t('agent.stop')}</button>}
    </aside>
  )
}

export function inferPermissionRisk(request: PermissionRequest): PermissionRisk {
  const summary = `${request.toolName} ${JSON.stringify(request.input)}`.toLocaleLowerCase()
  const tokens = new Set(summary.split(/[^a-z0-9-]+/).filter(Boolean))
  if (['rm', 'remove', 'delete', 'sudo', 'force', '--force'].some((token) => tokens.has(token))) return 'high'
  if (['write', 'edit', 'patch', 'command', 'run', 'exec', 'shell'].some((token) => tokens.has(token))) return 'medium'
  return 'low'
}

export function PermissionDialogQueue({
  requests,
  respond,
}: {
  requests: PermissionRequest[]
  respond: (requestId: string, behavior: PermissionDecision) => Promise<void>
}): ReactElement | null {
  const { t } = useLocale()
  const [confirmationRequestId, setConfirmationRequestId] = useState<string | null>(null)
  const request = requests[0]
  if (!request) return null

  const risk = inferPermissionRisk(request)
  const isConfirmed = risk === 'high' && confirmationRequestId === request.requestId
  const needsConfirmation = risk === 'high' && !isConfirmed
  const allow = (decision: 'allow' | 'allow_session'): void => {
    if (needsConfirmation) {
      setConfirmationRequestId(request.requestId)
      return
    }
    setConfirmationRequestId(null)
    void respond(request.requestId, decision)
  }
  return (
    <div className="permission-backdrop">
      <section aria-describedby="permission-description" aria-labelledby="permission-title" aria-modal="true" className={`permission-dialog risk-${risk}`} role="dialog">
        <div className="permission-dialog-heading">
          <ShieldAlert size={20} />
          <div>
            <span>{t('agent.risk', { risk })}</span>
            <h2 id="permission-title">{t('agent.requestsOperation')}</h2>
          </div>
        </div>
        <p id="permission-description">{t('agent.reviewOperation')}</p>
        <div className="permission-command">
          <span>{t('agent.session')}</span>
          <strong>{request.sessionId}</strong>
          <span>{t('agent.tool')}</span>
          <strong>{request.toolName}</strong>
          <code>{JSON.stringify(request.input, null, 2)}</code>
        </div>
        <div className="permission-timeout">
          <Clock3 size={13} />
          <span>{t('agent.autoDeny')}</span>
          {requests.length > 1 && <small>{t('agent.moreQueued', { count: requests.length - 1 })}</small>}
        </div>
        <div className="permission-dialog-actions">
          <button className="danger-outline-button" onClick={() => void respond(request.requestId, 'deny')} type="button">
            <X size={14} />
            <span>{t('agent.deny')}</span>
          </button>
          <button className="secondary-button" onClick={() => allow('allow_session')} type="button">
            <Check size={14} />
            <span>{needsConfirmation ? t('agent.reviewHighRisk') : isConfirmed ? t('agent.confirmSession') : t('agent.alwaysSession')}</span>
          </button>
          <button className="primary-button" onClick={() => allow('allow')} type="button">
            <Check size={14} />
            <span>{needsConfirmation ? t('agent.reviewHighRisk') : isConfirmed ? t('agent.confirmOnce') : t('agent.allowOnce')}</span>
          </button>
        </div>
      </section>
    </div>
  )
}

function InfoLine({ label, value }: { label: string; value: string }): ReactElement {
  return <div className="info-line"><span>{label}</span><strong>{value}</strong></div>
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat(undefined, { notation: value >= 1000 ? 'compact' : 'standard' }).format(value)
}

function formatOperationIndex(index: number): string {
  return `0:${String(index).padStart(2, '0')}`
}
