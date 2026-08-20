import { FileCheck2, ShieldAlert, Sparkles } from 'lucide-react'
import {
  lazy,
  Suspense,
  useEffect,
  useState,
  type ReactElement,
} from 'react'
import type { AxisTask, AxisTaskRunState } from '../../shared/axis-engine-contracts'
import type { AxisGuardedSafeWriteFeatureState } from '../../shared/axis-guarded-safe-write-contracts'
import { useAxisShadowStore } from '../stores/axis-shadow.store'
import {
  buildGuardedSafeWriteDraft,
  buildProposalDrafts,
  isGuardedSafeWriteApprovalEligible,
  isProposalCompatible,
} from './axis-guarded-write-review'

const LazyCodeDiffEditor = lazy(async () => {
  const module = await import('./CodeDiffEditor')
  return { default: module.CodeDiffEditor }
})

interface AxisGuardedWriteApprovalProps {
  featureState: AxisGuardedSafeWriteFeatureState | null
  locale: 'en' | 'zh-CN'
  runId: string
  task: AxisTask
  taskStatus: AxisTaskRunState['status']
}

const COPY = {
  en: {
    acknowledge: 'I reviewed every target and approve checkpoints, guarded writes, quality gates, and automatic rollback.',
    approve: 'Approve guarded write',
    description: 'Generate and review a bound proposal for every assigned file. Main will reject edited content or a changed review baseline before writing.',
    disabled: 'Guarded execution is disabled for this application launch.',
    generate: 'Generate model proposal',
    generating: 'Generating proposal…',
    proposal: 'Review model proposal',
    proposalLoaded: 'This reviewed content is locked to a short-lived Main receipt. Regenerate the proposal to change it.',
    running: 'Executing guarded write…',
    title: 'Guarded write approval',
  },
  'zh-CN': {
    acknowledge: '我已检查全部目标，并批准创建检查点、受保护写入、质量门与失败自动回滚。',
    approve: '批准受保护写入',
    description: '为全部已分配文件生成并审查绑定提案。内容被编辑或审查基线变化时，Main 会在写入前拒绝执行。',
    disabled: '本次应用启动未启用受保护执行。',
    generate: '生成模型提案',
    generating: '正在生成提案…',
    proposal: '审查模型提案',
    proposalLoaded: '审查内容已绑定短期 Main Receipt；如需修改，请重新生成提案。',
    running: '正在执行受保护写入…',
    title: '受保护写入批准',
  },
} as const

export function AxisGuardedWriteApproval({
  featureState,
  locale,
  runId,
  task,
  taskStatus,
}: AxisGuardedWriteApprovalProps): ReactElement | null {
  const copy = COPY[locale]
  const executeGuardedSafeWrite = useAxisShadowStore(
    (state) => state.executeGuardedSafeWrite,
  )
  const guardedRunningTaskId = useAxisShadowStore(
    (state) => state.guardedRunningTaskId,
  )
  const guardedProposal = useAxisShadowStore((state) => state.guardedProposal)
  const guardedProposalReceipt = useAxisShadowStore(
    (state) => state.guardedProposalReceipt,
  )
  const guardedProposingTaskId = useAxisShadowStore(
    (state) => state.guardedProposingTaskId,
  )
  const proposeGuardedSafeWrite = useAxisShadowStore(
    (state) => state.proposeGuardedSafeWrite,
  )
  const runRevision = useAxisShadowStore(
    (state) => state.runStates.find((runState) => runState.runId === runId)?.revision ?? 0,
  )
  const [acknowledged, setAcknowledged] = useState(false)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [reviewFilePath, setReviewFilePath] = useState<string | null>(null)

  useEffect(() => {
    setAcknowledged(false)
    setDrafts(Object.fromEntries(task.assignedFiles.map((filePath) => [filePath, ''])))
    setReviewFilePath(null)
  }, [task.id, task.assignedFiles])

  const isRunning = guardedRunningTaskId === task.id
  const isProposing = guardedProposingTaskId === task.id
  const isEnabled = featureState?.enabled === true
  const proposal = isProposalCompatible(
    guardedProposal,
    guardedProposalReceipt,
    runId,
    task.id,
    runRevision,
    task.assignedFiles,
  ) ? guardedProposal : null
  const reviewFile = proposal?.files.find(
    (file) => file.filePath === reviewFilePath,
  ) ?? proposal?.files[0] ?? null

  useEffect(() => {
    if (!proposal) return
    setAcknowledged(false)
    setDrafts(buildProposalDrafts(proposal))
    setReviewFilePath(proposal.files[0]?.filePath ?? null)
  }, [proposal?.proposalId])

  if (!isGuardedSafeWriteApprovalEligible(task, taskStatus)) return null

  return (
    <section className="pv-axis-guarded-approval">
      <header>
        <span><ShieldAlert aria-hidden="true" size={14} /><strong>{copy.title}</strong></span>
        <small>{task.assignedFiles.length} file{task.assignedFiles.length === 1 ? '' : 's'}</small>
      </header>
      <p>{copy.description}</p>
      {!isEnabled && <p className="pv-axis-guarded-disabled">{copy.disabled}</p>}
      <button
        className="pv-axis-proposal-button"
        disabled={!isEnabled || isRunning || isProposing}
        onClick={() => void proposeGuardedSafeWrite(runId, task.id)}
        type="button"
      >
        <Sparkles aria-hidden="true" size={14} />
        {isProposing ? copy.generating : copy.generate}
      </button>
      {proposal && reviewFile && (
        <div className="pv-axis-proposal-review">
          <header>
            <span><strong>{copy.proposal}</strong><small>{copy.proposalLoaded}</small></span>
            <select
              aria-label={copy.proposal}
              onChange={(event) => setReviewFilePath(event.target.value)}
              value={reviewFile.filePath}
            >
              {proposal.files.map((file) => (
                <option key={file.filePath} value={file.filePath}>
                  {file.filePath}
                </option>
              ))}
            </select>
          </header>
          <Suspense fallback={<div className="pv-axis-proposal-loading">Loading Diff Review…</div>}>
            <LazyCodeDiffEditor
              filePath={reviewFile.filePath}
              modified={drafts[reviewFile.filePath] ?? reviewFile.proposedContent}
              original={reviewFile.originalContent}
            />
          </Suspense>
        </div>
      )}
      <div className="pv-axis-guarded-drafts">
        {task.assignedFiles.map((filePath) => (
          <label key={filePath}>
            <span>{filePath}</span>
            <textarea
              aria-label={`${copy.title}: ${filePath}`}
              disabled={!isEnabled || isRunning || isProposing}
              onChange={(event) => setDrafts((current) => ({
                ...current,
                [filePath]: event.target.value,
              }))}
              readOnly={proposal !== null}
              spellCheck={false}
              value={drafts[filePath] ?? ''}
            />
          </label>
        ))}
      </div>
      <label className="pv-axis-guarded-confirm">
        <input
          checked={acknowledged}
          disabled={!isEnabled || !proposal || isRunning || isProposing}
          onChange={(event) => setAcknowledged(event.target.checked)}
          type="checkbox"
        />
        <span>{copy.acknowledge}</span>
      </label>
      <button
        disabled={!isEnabled || !proposal || !acknowledged || isRunning || isProposing}
        onClick={() => void executeGuardedSafeWrite(
          runId,
          task.id,
          buildGuardedSafeWriteDraft(task.assignedFiles, drafts),
        )}
        type="button"
      >
        <FileCheck2 aria-hidden="true" size={14} />
        {isRunning ? copy.running : copy.approve}
      </button>
    </section>
  )
}
