import { Bot, ChevronDown, Code2, FileCog, Filter, GitBranch, MoreHorizontal, Plus, Search, TerminalSquare, Workflow } from 'lucide-react'
import { useMemo, useState, type ReactElement } from 'react'

export interface AutomationSummary {
  id: string
  lastRunAt: string | null
  schedule: string
  status: 'active' | 'failed' | 'paused'
  title: string
  trigger?: string
  run?: { branch?: string; durationMs: number; logLines: readonly string[]; passedSteps: number; startedAt: string; totalSteps: number }
}

export interface AutomationWorkspaceSnapshot {
  items: AutomationSummary[]
  runtimeAvailable: boolean
  selectedId: string | null
}

type AutomationView = 'create' | 'home' | 'run'

export function AutomationWorkspace({ onBrowseTemplates, snapshot }: { onBrowseTemplates: () => void; snapshot: AutomationWorkspaceSnapshot }): ReactElement {
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState(snapshot.selectedId)
  const [view, setView] = useState<AutomationView>(snapshot.selectedId ? 'run' : 'home')
  const selected = snapshot.items.find((item) => item.id === selectedId) ?? null
  const items = useMemo(() => snapshot.items.filter((item) => !query.trim() || `${item.title} ${item.schedule} ${item.trigger ?? ''}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())), [query, snapshot.items])

  if (view === 'create') return <AutomationCreate runtimeAvailable={snapshot.runtimeAvailable} onCancel={() => setView('home')} />
  if (view === 'run' && selected) return <AutomationRun item={selected} onBack={() => setView('home')} runtimeAvailable={snapshot.runtimeAvailable} />

  const active = snapshot.items.filter((item) => item.status === 'active').length
  const paused = snapshot.items.filter((item) => item.status === 'paused').length
  const failed = snapshot.items.filter((item) => item.status === 'failed').length
  const today = new Date().toISOString().slice(0, 10)
  const runsToday = snapshot.items.filter((item) => item.lastRunAt?.startsWith(today)).length
  return <section className="pv-automation-home" data-figma-screen="1499:11725">
    <header><div><h1>Automations</h1><p>Manage automated workflows, triggers, and scheduled tasks.</p></div><button className="primary" onClick={() => setView('create')} type="button">New Automation</button></header>
    <div className="pv-automation-metrics"><AutomationMetric label="ACTIVE" value={active} /><AutomationMetric label="PAUSED" value={paused} /><AutomationMetric label="FAILED" value={failed} /><AutomationMetric label="RUNS TODAY" value={runsToday} /></div>
    <div className="pv-automation-toolbar"><label><Search size={16} /><input aria-label="Search automations" onChange={(event) => setQuery(event.target.value)} placeholder="Search automations..." type="search" value={query} /></label><button type="button">Sort: <strong>Name</strong><ChevronDown size={12} /></button></div>
    <div className="pv-automation-list">{items.map((item) => <button key={item.id} onClick={() => { setSelectedId(item.id); setView('run') }} type="button"><span><strong>{item.title}</strong><em>{item.trigger ?? 'Configured trigger'}</em><small>{item.schedule}</small><small>Last run: {item.lastRunAt ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.lastRunAt)) : 'Never'}</small></span><Workflow size={15} /></button>)}{items.length === 0 && <div className="pv-automation-zero"><Workflow size={28} /><strong>No automations yet</strong><p>Configured pipelines will appear here. The Figma examples are not copied into your workspace.</p><div><button disabled={!snapshot.runtimeAvailable} onClick={() => setView('create')} title={snapshot.runtimeAvailable ? undefined : 'Automation runtime is not available'} type="button"><Plus size={14} />Create automation</button><button onClick={onBrowseTemplates} type="button">Browse templates</button></div></div>}</div>
  </section>
}

function AutomationMetric({ label, value }: { label: string; value: number }): ReactElement { return <article><span>{label}</span><strong>{value}</strong></article> }

function AutomationCreate({ onCancel, runtimeAvailable }: { onCancel: () => void; runtimeAvailable: boolean }): ReactElement {
  const [name, setName] = useState('')
  return <section className="pv-automation-create" data-figma-screen="1499:12679">
    <header><div><small>Automations&nbsp;&nbsp;/&nbsp;&nbsp;Create Pipeline</small><h1>Create Pipeline</h1><p>Configure a new automation pipeline from scratch.</p></div><div><button onClick={onCancel} type="button">Cancel</button><button disabled type="button">Save Draft</button><button className="primary" disabled={!runtimeAvailable || !name.trim()} title={runtimeAvailable ? undefined : 'Automation runtime is not available'} type="button">Create Pipeline</button></div></header>
    <div className="pv-automation-create-grid"><main><section><h2>Pipeline Basics</h2><label>PIPELINE NAME<input onChange={(event) => setName(event.target.value)} placeholder="e.g., Auto-deploy to staging" value={name} /></label><label>DESCRIPTION<textarea placeholder="Describe what this pipeline does..." /></label><label>TRIGGER TYPE<select defaultValue=""><option disabled value="">Select trigger type...</option><option>Manual</option><option>File Watch</option><option>Git Hook</option><option>Schedule</option></select></label><label>ENVIRONMENT<select defaultValue="local"><option value="local">Local</option></select></label><label>TIMEOUT<div><input defaultValue="30" min="1" type="number" /><span>minutes</span></div></label><label className="toggle-row"><span><strong>Enable Notifications</strong><small>Send alerts on pipeline completion or failure</small></span><input type="checkbox" /></label><label>TAGS / LABELS<input placeholder="e.g., frontend, staging, deploy" /></label></section><section><h2>Pipeline Steps</h2><p>Add steps after a compatible automation runtime is connected.</p></section></main><aside><section><h2>Step Types</h2><StepType icon={TerminalSquare} label="Shell Command" /><StepType icon={Bot} label="AI Agent" /><StepType icon={Code2} label="Code Action" /><StepType icon={FileCog} label="File Operation" /><StepType icon={Filter} label="Conditional" /></section><section><h2>Execution Settings</h2><label>RUN MODE<select><option>Sequential</option><option>Parallel</option></select></label><label className="toggle-row"><span><strong>Retry on Failure</strong><small>Re-run failed steps automatically</small></span><input type="checkbox" /></label></section></aside></div>
  </section>
}

function StepType({ icon: Icon, label }: { icon: typeof Workflow; label: string }): ReactElement { return <div className="pv-automation-step-type"><Icon size={17} /><span><strong>{label}</strong><small>Available when supported by the connected runtime.</small></span></div> }

function AutomationRun({ item, onBack, runtimeAvailable }: { item: AutomationSummary; onBack: () => void; runtimeAvailable: boolean }): ReactElement {
  const run = item.run
  return <section className="pv-automation-run" data-figma-screen="1499:12887"><header><div><button onClick={onBack} type="button">Automations</button><small>/ {item.title} / Run</small><h1>{run ? `Run · ${new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(run.startedAt))}` : 'Run details'}</h1></div><div><button disabled={!runtimeAvailable || !run} type="button">Re-run</button><button aria-label="Run actions" type="button"><MoreHorizontal size={16} /></button></div></header>{run ? <><div className="pv-automation-run-summary"><AutomationRunStat label="STATUS" value={item.status === 'failed' ? 'Failed' : 'Completed'} /><AutomationRunStat label="DURATION" value={formatDuration(run.durationMs)} /><AutomationRunStat label="STEPS" value={`${run.passedSteps}/${run.totalSteps} passed`} /><AutomationRunStat label="TRIGGER" value={item.trigger ?? 'Configured'} /><AutomationRunStat label="BRANCH" value={run.branch ?? '—'} /></div><div className="pv-automation-run-grid"><section><h2>Pipeline Steps</h2><div className="pv-automation-run-empty"><GitBranch size={20} /><p>Step-level output is not exposed by the current automation contract.</p></div></section><section><h2>Full Log Output</h2><pre>{run.logLines.join('\n') || 'No log output was recorded.'}</pre></section></div></> : <div className="pv-automation-zero"><Workflow size={28} /><strong>No run data</strong><p>This automation has not produced a real run record. Pivot does not generate sample logs.</p></div>}</section>
}

function AutomationRunStat({ label, value }: { label: string; value: string }): ReactElement { return <div><span>{label}</span><strong>{value}</strong></div> }
function formatDuration(value: number): string { return value < 1000 ? `${value}ms` : `${Math.round(value / 100) / 10}s` }
