import { Bot, FileText } from 'lucide-react'
import type { ReactElement } from 'react'
import type { AgentAdapterInfo, PlanDocument, SessionRecord } from '../../shared/types/domain'
import { useLocale } from '../i18n/locale-context'

const COPY = {
  en: { task: 'Task', scope: 'Scope', noScope: 'Open a workspace and describe the outcome to define this task.', risks: 'Risks', risk: 'Breaking change risk', rollback: 'Rollback plan available', permissions: 'Permissions', permissionTitle: 'Read-only planning', permission: 'Tool permissions remain visible during execution.', approved: 'Approved', details: 'Step detail', noStep: 'Generate a plan to inspect its steps.', runtime: 'Runtime', runConfig: 'Run configuration', mode: 'Execution mode', steps: 'Steps', status: 'Status' },
  'zh-CN': { task: '任务', scope: '范围', noScope: '打开工作区并描述目标，以定义这项任务。', risks: '风险', risk: '存在破坏性变更风险', rollback: '已有回滚方案', permissions: '权限', permissionTitle: '只读规划', permission: '执行时工具权限始终可见。', approved: '已批准', details: '步骤详情', noStep: '生成计划后可在此检查步骤。', runtime: '运行时', runConfig: '运行配置', mode: '执行模式', steps: '步骤', status: '状态' },
  ja: { task: 'タスク', scope: '範囲', noScope: 'ワークスペースを開き、目的を説明してください。', risks: 'リスク', risk: '破壊的変更のリスク', rollback: 'ロールバック計画あり', permissions: '権限', permissionTitle: '読み取り専用計画', permission: '実行中もツール権限を表示します。', approved: '承認済み', details: 'ステップ詳細', noStep: '計画を生成するとステップを確認できます。', runtime: 'ランタイム', runConfig: '実行設定', mode: '実行モード', steps: 'ステップ', status: '状態' },
  de: { task: 'Aufgabe', scope: 'Umfang', noScope: 'Arbeitsbereich öffnen und das Ziel beschreiben.', risks: 'Risiken', risk: 'Risiko einer inkompatiblen Änderung', rollback: 'Rollback-Plan verfügbar', permissions: 'Berechtigungen', permissionTitle: 'Schreibgeschützte Planung', permission: 'Werkzeugrechte bleiben bei der Ausführung sichtbar.', approved: 'Freigegeben', details: 'Schrittdetails', noStep: 'Einen Plan erzeugen, um Schritte zu prüfen.', runtime: 'Laufzeit', runConfig: 'Ausführungskonfiguration', mode: 'Ausführungsmodus', steps: 'Schritte', status: 'Status' },
} as const

interface WorkPlanChromeProps {
  adapterInfo: AgentAdapterInfo | null
  plan: PlanDocument | null
  session: SessionRecord | null
}

export function WorkPlanContextSidebar({ plan, session }: Omit<WorkPlanChromeProps, 'adapterInfo'>): ReactElement {
  const copy = useCopy()
  const scopeItems = plan?.steps.slice(0, 4).map((step) => step.title) ?? []
  return (
    <aside className="pv-plan-context">
      <header><strong>{plan?.title ?? session?.title ?? copy.task}</strong><small>{shortProjectName(session?.projectPath ?? '')} · {plan?.steps.length ?? 0} {copy.steps}</small></header>
      <section className="pv-plan-scope"><h2>{copy.scope}</h2>{scopeItems.length > 0 ? <ul>{scopeItems.map((item) => <li key={item}>{item}</li>)}</ul> : <p>{plan?.source || copy.noScope}</p>}</section>
      <section className="pv-plan-risks"><h2>{copy.risks}</h2><div><article className="attention">{copy.risk}</article><article>{copy.rollback}</article></div></section>
      <section className="pv-plan-permissions"><h2>{copy.permissions}</h2><article><div><strong>{copy.permissionTitle}</strong><em>{copy.approved}</em></div><p>{copy.permission}</p></article></section>
    </aside>
  )
}

export function WorkPlanInspector({ adapterInfo, plan }: Omit<WorkPlanChromeProps, 'session'>): ReactElement {
  const copy = useCopy()
  const selectedStep = plan?.steps.find((step) => step.status === 'running') ?? plan?.steps.find((step) => step.status === 'pending') ?? plan?.steps[0] ?? null
  return (
    <aside className="pv-plan-inspector">
      <header><span>{copy.details}</span><strong>{selectedStep?.title ?? copy.noStep}</strong></header>
      {selectedStep && <section className="pv-inspector-copy"><FileText size={15} /><p>{selectedStep.description}</p>{selectedStep.targets.length > 0 && <small>{selectedStep.targets.join(' · ')}</small>}</section>}
      <section><h2><Bot size={14} />{copy.runtime}</h2><dl><div><dt>{copy.runtime}</dt><dd>{adapterInfo?.label ?? 'Pivot Engine'}</dd></div><div><dt>{copy.status}</dt><dd>{plan?.status ?? '—'}</dd></div></dl></section>
      <section><h2>{copy.runConfig}</h2><dl><div><dt>{copy.mode}</dt><dd>{plan?.executionMode ?? '—'}</dd></div><div><dt>{copy.steps}</dt><dd>{plan?.steps.length ?? 0}</dd></div></dl></section>
    </aside>
  )
}

function useCopy(): (typeof COPY)[keyof typeof COPY] {
  const { locale } = useLocale()
  return COPY[locale === 'zh-CN' || locale === 'ja' || locale === 'de' ? locale : 'en']
}

function shortProjectName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? 'Pivot'
}
