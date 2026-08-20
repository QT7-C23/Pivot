import { CheckCircle2, Circle, ListChecks, Pause, Play, Square, WandSparkles } from 'lucide-react'
import { useEffect, useState, type ReactElement } from 'react'
import type { PlanDocument, PlanExecutionMode } from '../../shared/types/domain'
import { useLocale } from '../i18n/locale-context'

const COPY = {
  en: { createTitle: 'Create an implementation plan', createDescription: 'Planning is code-enforced read-only. Review the structured steps before approving execution.', placeholder: 'Describe the feature, fix, or refactor…', planning: 'Planning…', generate: 'Generate plan', plan: 'Plan', approval: 'Approval gate', approvalHint: 'Choose how approved steps run.', automatic: 'Automatic', automaticHint: 'Run all approved steps, then review the final changes.', step: 'Step by step', stepHint: 'Pause after every step for inspection.', selected: 'Selected only', selectedHint: 'Run only the checked steps.', approve: 'Approve plan', start: 'Start execution', continue: 'Continue next step', executing: 'Executing approved step…', cancel: 'Cancel', completed: 'completed', stepsExecuted: 'steps executed' },
  'zh-CN': { createTitle: '创建实施计划', createDescription: '规划过程由代码强制保持只读。批准执行前，请先检查结构化步骤。', placeholder: '描述功能、修复或重构目标…', planning: '正在规划…', generate: '生成计划', plan: '计划', approval: '批准关卡', approvalHint: '选择批准后的步骤如何运行。', automatic: '自动执行', automaticHint: '运行全部已批准步骤，最后检查变更。', step: '逐步执行', stepHint: '每完成一步暂停并检查。', selected: '仅选中步骤', selectedHint: '只运行勾选的步骤。', approve: '批准计划', start: '开始执行', continue: '继续下一步', executing: '正在执行已批准步骤…', cancel: '取消', completed: '已完成', stepsExecuted: '个步骤已执行' },
  ja: { createTitle: '実装計画を作成', createDescription: '計画処理はコードにより読み取り専用です。実行を承認する前に手順を確認してください。', placeholder: '機能、修正、リファクタリングを説明…', planning: '計画中…', generate: '計画を生成', plan: '計画', approval: '承認ゲート', approvalHint: '承認済みステップの実行方法を選択します。', automatic: '自動', automaticHint: '承認済みの全ステップを実行し、最後に変更を確認します。', step: '一歩ずつ', stepHint: '各ステップ後に一時停止します。', selected: '選択のみ', selectedHint: 'チェックしたステップのみ実行します。', approve: '計画を承認', start: '実行を開始', continue: '次のステップへ', executing: '承認済みステップを実行中…', cancel: 'キャンセル', completed: '完了', stepsExecuted: 'ステップ実行済み' },
  de: { createTitle: 'Implementierungsplan erstellen', createDescription: 'Die Planung ist technisch schreibgeschützt. Prüfe die strukturierten Schritte vor der Freigabe.', placeholder: 'Funktion, Fehlerbehebung oder Refactoring beschreiben…', planning: 'Planung…', generate: 'Plan erzeugen', plan: 'Plan', approval: 'Freigabe', approvalHint: 'Ausführung der freigegebenen Schritte wählen.', automatic: 'Automatisch', automaticHint: 'Alle freigegebenen Schritte ausführen und Änderungen prüfen.', step: 'Schrittweise', stepHint: 'Nach jedem Schritt zur Prüfung pausieren.', selected: 'Nur Auswahl', selectedHint: 'Nur markierte Schritte ausführen.', approve: 'Plan freigeben', start: 'Ausführung starten', continue: 'Nächsten Schritt fortsetzen', executing: 'Freigegebenen Schritt ausführen…', cancel: 'Abbrechen', completed: 'abgeschlossen', stepsExecuted: 'Schritte ausgeführt' },
} as const

export function PlanWorkspace({
  approve,
  cancel,
  execute,
  executeNext,
  generate,
  isBusy,
  plan,
  sessionId,
}: {
  approve: (mode: PlanExecutionMode, selectedStepIds?: string[]) => Promise<void>
  cancel: () => Promise<void>
  execute: () => Promise<void>
  executeNext: () => Promise<void>
  generate: (sessionId: string, source: string) => Promise<void>
  isBusy: boolean
  plan: PlanDocument | null
  sessionId: string | null
}): ReactElement {
  const { locale } = useLocale()
  const copy = COPY[locale === 'zh-CN' || locale === 'ja' || locale === 'de' ? locale : 'en']
  const [source, setSource] = useState('')
  const [mode, setMode] = useState<PlanExecutionMode>('auto')
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  useEffect(() => setSelectedIds(plan?.steps.map((step) => step.id) ?? []), [plan?.id])

  if (!plan || plan.status === 'cancelled' || plan.status === 'done') {
    return (
      <section className="plan-workspace empty-plan">
        {plan?.status === 'done' && <PlanSummary plan={plan} />}
        <div className="plan-create-card">
          <WandSparkles size={28} />
          <h2>{copy.createTitle}</h2>
          <p>{copy.createDescription}</p>
          <textarea aria-label="Plan request" onChange={(event) => setSource(event.target.value)} placeholder={copy.placeholder} value={source} />
          <button className="primary-button" disabled={!sessionId || !source.trim() || isBusy} onClick={() => sessionId && void generate(sessionId, source)} type="button">
            {isBusy ? copy.planning : copy.generate}
          </button>
        </div>
      </section>
    )
  }

  const canApprove = plan.status === 'draft'
  const canExecute = plan.status === 'ready'
  const canContinue = plan.status === 'paused'

  return (
    <section className="plan-workspace">
      <header className="plan-header">
        <div><span className="section-label">{copy.plan} · v{plan.version}</span><h2>{plan.title}</h2><p>{plan.source}</p></div>
        <span className={`plan-status ${plan.status}`}>{plan.status}</span>
      </header>
      <ol className="plan-step-list">
        {plan.steps.map((step) => (
          <li className={`plan-step ${step.status}`} key={step.id}>
            {canApprove && mode === 'selective' ? (
              <input
                aria-label={`Select ${step.title}`}
                checked={selectedIds.includes(step.id)}
                onChange={() => setSelectedIds((ids) => ids.includes(step.id) ? ids.filter((id) => id !== step.id) : [...ids, step.id])}
                type="checkbox"
              />
            ) : step.status === 'done' ? <CheckCircle2 size={17} /> : <Circle size={17} />}
            <div><strong>{step.order + 1}. {step.title}</strong><p>{step.description}</p>{step.targets.length > 0 && <small>{step.targets.join(' · ')}</small>}</div>
          </li>
        ))}
      </ol>
      {canApprove && (
        <section className="plan-approval-gate">
          <div><ListChecks size={18} /><strong>{copy.approval}</strong><span>{copy.approvalHint}</span></div>
          <div className="plan-mode-options">
            {([
              ['auto', copy.automatic, copy.automaticHint],
              ['step', copy.step, copy.stepHint],
              ['selective', copy.selected, copy.selectedHint],
            ] as const).map(([value, label, description]) => (
              <label className={mode === value ? 'active' : ''} key={value}>
                <input checked={mode === value} onChange={() => setMode(value)} type="radio" />
                <strong>{label}</strong><span>{description}</span>
              </label>
            ))}
          </div>
          <button className="primary-button" disabled={mode === 'selective' && selectedIds.length === 0} onClick={() => void approve(mode, selectedIds)} type="button">{copy.approve}</button>
        </section>
      )}
      <footer className="plan-controls">
        {canExecute && <button className="primary-button" disabled={isBusy} onClick={() => void execute()} type="button"><Play size={14} />{copy.start}</button>}
        {canContinue && <button className="primary-button" disabled={isBusy} onClick={() => void executeNext()} type="button"><Play size={14} />{copy.continue}</button>}
        {plan.status === 'executing' && <span><Pause size={14} />{copy.executing}</span>}
        <button className="secondary-button" disabled={isBusy} onClick={() => void cancel()} type="button"><Square size={13} />{copy.cancel}</button>
      </footer>
    </section>
  )
}

function PlanSummary({ plan }: { plan: PlanDocument }): ReactElement {
  const { locale } = useLocale()
  const copy = COPY[locale === 'zh-CN' || locale === 'ja' || locale === 'de' ? locale : 'en']
  return <div className="plan-complete"><CheckCircle2 size={20} /><strong>{plan.title} {copy.completed}</strong><span>{plan.steps.filter((step) => step.status === 'done').length}/{plan.steps.length} {copy.stepsExecuted}.</span></div>
}
