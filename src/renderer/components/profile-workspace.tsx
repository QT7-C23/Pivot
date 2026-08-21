import { Check, Download, Edit3, Trophy, X } from 'lucide-react'
import { useEffect, useMemo, useState, type CSSProperties, type FormEvent, type ReactElement } from 'react'
import type { SessionRecord, WorkItemSnapshot } from '../../shared/types/domain'
import type { ProfilePreferences } from '../../shared/profile-preferences'
import { useLocale } from '../i18n/locale-context'
import type { AgentOperation } from '../stores/agent.store'
import { useProfileStore } from '../stores/profile.store'

interface ProfileWorkspaceProps {
  operations: AgentOperation[]
  sessions: SessionRecord[]
  workItems: WorkItemSnapshot[]
}

export function ProfileWorkspace({ operations, sessions, workItems }: ProfileWorkspaceProps): ReactElement {
  const { locale } = useLocale()
  const zh = locale === 'zh-CN'
  const [view, setView] = useState<'home' | 'achievements'>('home')
  const [editing, setEditing] = useState(false)
  const preferences = useProfileStore((state) => state.preferences)
  const load = useProfileStore((state) => state.load)
  const save = useProfileStore((state) => state.save)
  useEffect(() => load(), [load])
  const projects = useMemo(() => new Set(sessions.map((session) => session.projectPath).filter(Boolean)), [sessions])
  const completed = workItems.filter((item) => item.task.status === 'delivered').length
  const activeDays = new Set(sessions.map((session) => session.updatedAt.slice(0, 10))).size
  const achievements = createAchievements({ completed, operations: operations.length, projects: projects.size, sessions: sessions.length })
  const unlocked = achievements.filter((achievement) => achievement.unlocked)

  return <section className="pv-profile-workspace" data-figma-screen={view === 'home' ? '818:9607' : '818:9019'}>
    {view === 'home' ? <>
      <header className="pv-profile-header">
        <Avatar name={preferences.displayName} />
        <div><h1>{preferences.displayName}</h1><p>{[preferences.email, preferences.bio].filter(Boolean).join(' · ') || (zh ? '本地 Pivot 配置文件' : 'Local Pivot profile')}</p></div>
      </header>
      <div className="pv-profile-actions"><button onClick={() => setEditing(true)} type="button"><Edit3 size={13} />{zh ? '编辑资料' : 'Edit Profile'}</button><button className="primary" onClick={() => setView('achievements')} type="button"><Trophy size={13} />{zh ? '成就' : 'Achievements'}</button><button onClick={() => exportProfile(preferences, sessions)} type="button"><Download size={13} />{zh ? '导出数据' : 'Export Data'}</button></div>
      <div className="pv-profile-metrics">
        <Metric label={zh ? '会话总数' : 'Total Sessions'} value={sessions.length} />
        <Metric label={zh ? '任务总数' : 'Total Tasks'} value={workItems.length} />
        <Metric label={zh ? '已完成' : 'Completed'} value={completed} />
        <Metric label={zh ? '活跃天数' : 'Active Days'} value={activeDays} />
        <Metric label={zh ? 'Agent 操作' : 'Agent Operations'} value={operations.length} />
        <Metric label={zh ? '活跃项目' : 'Active Projects'} value={projects.size} />
      </div>
      <div className="pv-profile-summary-grid">
        <Summary title={zh ? '总计' : 'Total'} values={[[zh ? '会话' : 'Sessions', sessions.length], [zh ? '任务' : 'Tasks', workItems.length], [zh ? '已完成' : 'Completed', completed]]} />
        <Summary title={zh ? '每会话平均' : 'Per Session Avg'} values={[[zh ? '任务' : 'Tasks', average(workItems.length, sessions.length)], [zh ? 'Agent 操作' : 'Agent operations', average(operations.length, sessions.length)], [zh ? '成本' : 'Cost', '—']]} />
        <Summary title={zh ? '活动概览' : 'Activity Overview'} values={[[zh ? '活跃天数' : 'Active days', activeDays], [zh ? '项目' : 'Projects', projects.size], [zh ? '已解锁成就' : 'Unlocked', unlocked.length]]} />
      </div>
      <ActivityGrid sessions={sessions} />
    </> : <Achievements achievements={achievements} onBack={() => setView('home')} />}
    {editing && <ProfileEditor initial={preferences} onCancel={() => setEditing(false)} onSave={(next) => { save(next); setEditing(false) }} />}
  </section>
}

function Achievements({ achievements, onBack }: { achievements: Achievement[]; onBack: () => void }): ReactElement {
  const unlocked = achievements.filter((item) => item.unlocked).length
  const percent = Math.round((unlocked / achievements.length) * 100)
  return <div className="pv-achievements">
    <header><div className="pv-achievement-ring" style={{ '--progress': `${percent * 3.6}deg` } as CSSProperties}>{percent}%</div><div><h1>Achievement Progress</h1><p>{unlocked} / {achievements.length} Unlocked</p><button onClick={onBack} type="button">Back to Profile</button></div></header>
    <section><h2>All Achievements</h2><div className="pv-achievement-grid">{achievements.map((item) => <article className={item.unlocked ? 'unlocked' : ''} key={item.id}>{item.unlocked ? <Check size={15} /> : <span />}<div><strong>{item.title}</strong><small>{item.description}</small></div><em>{item.progress}</em></article>)}</div></section>
  </div>
}

function ProfileEditor({ initial, onCancel, onSave }: { initial: ProfilePreferences; onCancel: () => void; onSave: (next: ProfilePreferences) => void }): ReactElement {
  const [draft, setDraft] = useState(initial)
  const [error, setError] = useState('')
  function submit(event: FormEvent): void {
    event.preventDefault()
    if (!draft.displayName.trim()) { setError('Name is required.'); return }
    if (draft.email && !/^\S+@\S+\.\S+$/.test(draft.email)) { setError('Enter a valid email address.'); return }
    onSave({ ...draft, displayName: draft.displayName.trim() })
  }
  return <div className="pv-profile-modal-backdrop"><form aria-modal="true" className="pv-profile-modal" data-figma-screen="818:8988" onSubmit={submit} role="dialog"><header><h2>Edit Profile</h2><button aria-label="Close" onClick={onCancel} type="button"><X size={17} /></button></header><div className="pv-profile-avatar-edit"><Avatar name={draft.displayName} /><small>Profile initials update from your name.</small></div><label><span>Name</span><input maxLength={80} onChange={(event) => setDraft({ ...draft, displayName: event.target.value })} value={draft.displayName} /></label><label><span>Email</span><input maxLength={160} onChange={(event) => setDraft({ ...draft, email: event.target.value })} type="email" value={draft.email} /></label><label><span>Bio</span><textarea maxLength={200} onChange={(event) => setDraft({ ...draft, bio: event.target.value })} value={draft.bio} /><small>{draft.bio.length}/200</small></label>{error && <p className="pv-profile-error">{error}</p>}<footer><button onClick={onCancel} type="button">Cancel</button><button className="primary" type="submit">Save</button></footer></form></div>
}

function Avatar({ name }: { name: string }): ReactElement { return <span className="pv-profile-avatar">{name.trim().slice(0, 1).toLocaleUpperCase() || 'P'}</span> }
function Metric({ label, value }: { label: string; value: number | string }): ReactElement { return <article><small>{label}</small><strong>{value}</strong></article> }
function Summary({ title, values }: { title: string; values: Array<[string, number | string]> }): ReactElement { return <article><h2>{title}</h2>{values.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</article> }
function ActivityGrid({ sessions }: { sessions: SessionRecord[] }): ReactElement { const active = new Set(sessions.map((session) => session.updatedAt.slice(0, 10))); const today = new Date(); return <section className="pv-profile-activity"><h2>Activity (last 52 weeks)</h2><div>{Array.from({ length: 364 }, (_, index) => { const date = new Date(today); date.setDate(today.getDate() - (363 - index)); const key = date.toISOString().slice(0, 10); return <i className={active.has(key) ? 'active' : ''} key={key} title={key} /> })}</div></section> }
function average(total: number, count: number): string { return count === 0 ? '—' : (total / count).toFixed(1) }

interface Achievement { description: string; id: string; progress: string; title: string; unlocked: boolean }
function createAchievements(input: { completed: number; operations: number; projects: number; sessions: number }): Achievement[] { return [
  { id: 'first-chat', title: 'First Chat', description: 'Complete your first conversation', progress: `${Math.min(input.sessions, 1)}/1`, unlocked: input.sessions >= 1 },
  { id: 'project-builder', title: 'Project Builder', description: 'Work in three projects', progress: `${Math.min(input.projects, 3)}/3`, unlocked: input.projects >= 3 },
  { id: 'task-finisher', title: 'Task Finisher', description: 'Deliver five tasks', progress: `${Math.min(input.completed, 5)}/5`, unlocked: input.completed >= 5 },
  { id: 'agent-pro', title: 'Agent Pro', description: 'Complete 100 agent operations', progress: `${Math.min(input.operations, 100)}/100`, unlocked: input.operations >= 100 },
] }
function exportProfile(profile: ProfilePreferences, sessions: SessionRecord[]): void { const anchor = document.createElement('a'); anchor.href = URL.createObjectURL(new Blob([JSON.stringify({ profile, sessions }, null, 2)], { type: 'application/json' })); anchor.download = 'pivot-profile-export.json'; anchor.click(); URL.revokeObjectURL(anchor.href) }
