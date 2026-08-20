import { AlertCircle, CheckCircle2, ChevronLeft, ShieldAlert, X } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactElement } from 'react'
import type { AttentionObservation, AttentionRecord, AttentionStatus } from '../../shared/attention'
import type { PermissionRequest } from '../../shared/types/domain'
import { createAttentionClient, type AttentionClientPort } from '../services/attention-client'

export interface AttentionItem {
  readonly contextLabel: string
  readonly detail: string
  readonly id: string
  readonly kind: 'permission' | 'runtime'
  readonly severity: 'attention' | 'error'
  readonly title: string
}

export interface AttentionProjectionInput {
  readonly error: string | null
  readonly permissionRequests: readonly PermissionRequest[]
}

export interface AttentionEntry extends AttentionItem {
  readonly createdAt: string | null
  readonly recordId: string | null
  readonly revision: number | null
  readonly status: AttentionStatus
  readonly updatedAt: string | null
}

const defaultClient = createAttentionClient()

export function projectAttentionItems({ error, permissionRequests }: AttentionProjectionInput): AttentionItem[] {
  const items: AttentionItem[] = []
  const normalizedError = error?.trim()
  if (normalizedError) {
    items.push({
      contextLabel: 'Local Executable', detail: normalizedError, id: 'runtime:error', kind: 'runtime', severity: 'error',
      title: normalizedError.split(/(?<=[.!?])\s/, 1)[0] ?? normalizedError,
    })
  }
  for (const request of permissionRequests) {
    const inputSummary = summarizeInput(request.input)
    items.push({
      contextLabel: 'Active task',
      detail: inputSummary ? `${request.toolName} requested access to ${inputSummary}.` : `${request.toolName} requested access for the active task.`,
      id: `permission:${request.requestId}`, kind: 'permission', severity: 'attention',
      title: `File access requested: ${request.toolName}`,
    })
  }
  return items
}

export function AttentionCenter({ client = defaultClient, items, onReviewPermission, onSwitchRuntime }: {
  client?: AttentionClientPort
  items: readonly AttentionItem[]
  onReviewPermission?: () => void
  onSwitchRuntime?: () => void
}): ReactElement | null {
  const [activeId, setActiveId] = useState<string | null>(items[0]?.id ?? null)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [queueOpen, setQueueOpen] = useState(true)
  const [records, setRecords] = useState<AttentionRecord[]>([])

  useEffect(() => {
    let current = true
    async function synchronize(): Promise<void> {
      try {
        await Promise.all(items.map((item) => client.observe(toObservation(item))))
        const history = await client.list()
        if (current) { setError(null); setRecords(history) }
      } catch (cause) {
        if (current) setError(toMessage(cause))
      }
    }
    void synchronize()
    return () => { current = false }
  }, [client, items])

  const entries = useMemo(() => mergeEntries(items, records), [items, records])
  useEffect(() => {
    if (activeId && entries.some((item) => item.id === activeId && item.status !== 'resolved')) return
    setActiveId(entries.find((item) => item.status !== 'resolved')?.id ?? null)
  }, [activeId, entries])
  useEffect(() => {
    if (detailId && entries.some((item) => item.id === detailId)) return
    setDetailId(null)
  }, [detailId, entries])

  if (entries.length === 0 && !error) return null
  const active = entries.find((item) => item.id === activeId && item.status !== 'resolved') ?? null
  const detail = entries.find((item) => item.id === detailId) ?? null
  const openCount = entries.filter((item) => item.status !== 'resolved').length

  async function transition(entry: AttentionEntry, action: 'reopen' | 'resolve'): Promise<void> {
    try {
      const record = entry.recordId && entry.revision
        ? await client[action]({ attentionId: entry.recordId, expectedRevision: entry.revision })
        : await client.resolve(lifecycleRequest(await client.observe(toObservation(entry))))
      setRecords((current) => upsertRecord(current, record))
      setError(null)
      if (action === 'resolve') setActiveId(null)
    } catch (cause) {
      setError(toMessage(cause))
      try { setRecords(await client.list()) } catch { /* Keep the first actionable failure. */ }
    }
  }

  return <div className="pv-attention-center">
    {active && <section className={`pv-persistent-attention ${active.severity}`} data-figma-state="74:1976" role="alert">
      <span className="pv-attention-icon">{active.severity === 'error' ? <AlertCircle size={16} /> : <ShieldAlert size={16} />}</span>
      <div><strong>{active.title}</strong><p>{active.detail}</p>{active.kind === 'permission' && <button onClick={onReviewPermission} type="button">Review request</button>}</div>
      <button aria-label="Dismiss notification" className="pv-attention-dismiss" onClick={() => void transition(active, 'resolve')} type="button"><X size={14} /></button>
    </section>}
    <section className={queueOpen ? 'pv-attention-queue open' : 'pv-attention-queue'} data-figma-state={detail ? detailState(detail) : '425:6216'}>
      {detail ? <AttentionDetail entry={detail} error={error} onBack={() => setDetailId(null)} onReopen={() => void transition(detail, 'reopen')} onResolve={() => void transition(detail, 'resolve')} onReviewPermission={onReviewPermission} onSwitchRuntime={onSwitchRuntime} /> : <>
        <button aria-expanded={queueOpen} className="pv-attention-queue-heading" onClick={() => setQueueOpen((open) => !open)} type="button"><strong>Attention Queue</strong><span>{openCount}</span></button>
        {queueOpen && <div className="pv-attention-queue-list" data-figma-state="425:6216">
          {error && <p className="pv-attention-error" role="alert">{error}</p>}
          {entries.map((item) => <button data-status={item.status} key={item.id} onClick={() => setDetailId(item.id)} type="button"><i className={item.status === 'resolved' ? 'resolved' : item.severity} /><span><strong>{item.title}</strong><small>{item.status === 'resolved' ? `Resolved · ${item.detail}` : item.detail}</small></span></button>)}
        </div>}
      </>}
    </section>
  </div>
}

export function AttentionDetail({ entry, error, onBack, onReopen, onResolve, onReviewPermission, onSwitchRuntime }: {
  entry: AttentionEntry
  error: string | null
  onBack: () => void
  onReopen: () => void
  onResolve: () => void
  onReviewPermission?: () => void
  onSwitchRuntime?: () => void
}): ReactElement {
  const resolved = entry.status === 'resolved'
  return <div className="pv-attention-detail" data-figma-state={detailState(entry)}>
    <header><button onClick={onBack} type="button"><ChevronLeft size={16} />Back</button></header>
    <div className="pv-attention-detail-body">
      <div className="pv-attention-detail-meta"><span className={`pv-attention-badge ${entry.status} ${entry.severity}`}>{badgeLabel(entry)}</span><strong>{entry.title}</strong><small>{timelineLabel(entry)} · {entry.contextLabel}</small></div>
      {resolved ? <div className="pv-attention-resolution"><CheckCircle2 size={15} /><strong>Marked resolved</strong><p>The evidence remains available in local Attention history and can be reopened.</p></div> : <>
        <p className="pv-attention-detail-copy">{entry.detail}</p>
        <div className="pv-attention-evidence"><strong>Evidence retained</strong><p>This event is stored in local Attention history. It does not grant execution or filesystem authority.</p></div>
      </>}
      {error && <p className="pv-attention-error" role="alert">{error}</p>}
      <div className="pv-attention-detail-actions">
        {!resolved && entry.kind === 'permission' && onReviewPermission && <button className="primary" onClick={onReviewPermission} type="button">Review request</button>}
        {!resolved && entry.kind === 'runtime' && onSwitchRuntime && <button className="secondary" onClick={onSwitchRuntime} type="button">Switch Runtime</button>}
        {resolved ? <button className="primary" onClick={onReopen} type="button">Reopen</button> : <button className="ghost" onClick={onResolve} type="button">Dismiss</button>}
      </div>
    </div>
  </div>
}

function mergeEntries(items: readonly AttentionItem[], records: readonly AttentionRecord[]): AttentionEntry[] {
  const currentBySource = new Set(items.map((item) => item.id))
  const entries = records.map((record): AttentionEntry => ({
    contextLabel: record.contextLabel, createdAt: record.createdAt, detail: record.detail, id: record.sourceId,
    kind: record.kind, recordId: record.id, revision: record.revision, severity: record.severity,
    status: record.status, title: record.title, updatedAt: record.updatedAt,
  }))
  for (const item of items) {
    if (!entries.some((entry) => entry.id === item.id)) entries.unshift({ ...item, createdAt: null, recordId: null, revision: null, status: 'open', updatedAt: null })
  }
  return entries.sort((left, right) => Number(currentBySource.has(right.id)) - Number(currentBySource.has(left.id)) || (right.updatedAt ?? '').localeCompare(left.updatedAt ?? ''))
}

function toObservation(item: AttentionItem): AttentionObservation {
  return { contextLabel: item.contextLabel, detail: item.detail, kind: item.kind, severity: item.severity, sourceId: item.id, title: item.title }
}

function lifecycleRequest(record: AttentionRecord) { return { attentionId: record.id, expectedRevision: record.revision } }
function upsertRecord(records: readonly AttentionRecord[], next: AttentionRecord): AttentionRecord[] { return [next, ...records.filter((record) => record.id !== next.id)] }
function badgeLabel(entry: AttentionEntry): string { return entry.status === 'resolved' ? 'RESOLVED' : entry.status === 'reopened' ? 'REOPENED' : entry.severity === 'error' ? 'ERROR' : 'ATTENTION' }
function detailState(entry: AttentionEntry): string { return entry.status === 'resolved' ? '425:6268' : entry.status === 'reopened' ? '425:6287' : '425:6244' }
function timelineLabel(entry: AttentionEntry): string {
  if (!entry.updatedAt) return 'Logging now'
  return `${entry.status === 'resolved' ? 'Resolved' : entry.status === 'reopened' ? 'Reopened' : 'Logged'} ${formatRelative(entry.status === 'open' ? entry.createdAt ?? entry.updatedAt : entry.updatedAt)}`
}
function formatRelative(value: string): string {
  const minutes = Math.floor(Math.max(0, Date.now() - new Date(value).getTime()) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`
}
function summarizeInput(input: Record<string, unknown>): string {
  const candidate = input.path ?? input.filePath ?? input.directory ?? input.cwd
  if (typeof candidate === 'string' && candidate.trim()) return candidate.trim()
  const keys = Object.keys(input)
  return keys.length > 0 ? keys.slice(0, 3).join(', ') : ''
}
function toMessage(error: unknown): string { return error instanceof Error ? error.message : String(error) }
