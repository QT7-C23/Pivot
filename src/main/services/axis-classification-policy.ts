import {
  AxisClassificationProposalSchema,
  AxisPlanningContextSchema,
  ComplexityReportSchema,
  type AxisClassificationProposal,
  type AxisPlanningContext,
  type ComplexityReport,
} from '../../shared/axis-engine-contracts'

type RiskFlag = AxisClassificationProposal['riskFlags'][number]
type Gate = ComplexityReport['requiredGates'][number]
type Adjustment = ComplexityReport['policyAdjustments'][number]

export interface AxisClassificationEvidence {
  fileCount: number
  observedRiskFlags: RiskFlag[]
  repositoryScopes: Array<'main' | 'renderer' | 'shared'>
  sufficientRepositoryEvidence: boolean
}

const SCORE_FLOOR: Readonly<Record<RiskFlag, number>> = Object.freeze({
  'cross-module': 3,
  destructive: 4,
  'external-runtime': 4,
  'high-context': 3,
  'security-sensitive': 4,
})

const SCORE_ADJUSTMENT: Readonly<Record<RiskFlag, Adjustment>> = Object.freeze({
  'cross-module': 'score-raised-for-cross-module',
  destructive: 'score-raised-for-destructive',
  'external-runtime': 'score-raised-for-external-runtime',
  'high-context': 'score-raised-for-high-context',
  'security-sensitive': 'score-raised-for-security-sensitive',
})

export function extractAxisClassificationEvidence(
  input: AxisPlanningContext,
  scope: 'candidate-files' | 'repository-manifest' = 'repository-manifest',
  objective = '',
): AxisClassificationEvidence {
  const context = AxisPlanningContextSchema.parse(input)
  const normalizedFiles = context.availableFiles.map((file) => file.replaceAll('\\', '/').toLowerCase())
  const scopes = (['main', 'renderer', 'shared'] as const).filter((scope) => (
    normalizedFiles.some((file) => file.includes(`/src/${scope}/`) || file.startsWith(`src/${scope}/`))
  ))
  const risks = new Set<RiskFlag>()
  if (scope === 'candidate-files') {
    if (scopes.length > 1) risks.add('cross-module')
    if (normalizedFiles.some(isSecuritySensitivePath)) risks.add('security-sensitive')
    if (normalizedFiles.some(isExternalRuntimePath)) risks.add('external-runtime')
    if (normalizedFiles.some(isDestructivePath)) risks.add('destructive')
    if (context.availableFiles.length >= 40) risks.add('high-context')
    const normalizedObjective = objective.trim().toLowerCase()
    if (isSecuritySensitiveText(normalizedObjective)) risks.add('security-sensitive')
    if (isExternalRuntimeText(normalizedObjective)) risks.add('external-runtime')
    if (isDestructiveText(normalizedObjective)) risks.add('destructive')
  }
  return Object.freeze({
    fileCount: context.availableFiles.length,
    observedRiskFlags: [...risks],
    repositoryScopes: scopes,
    sufficientRepositoryEvidence: context.availableFiles.length > 0,
  })
}

export function requiredAxisGatesForRiskFlags(
  riskFlags: readonly RiskFlag[],
  confidence = 1,
): Gate[] {
  const gates: Gate[] = ['compile', 'test']
  if (
    riskFlags.includes('cross-module')
    || riskFlags.includes('destructive')
    || riskFlags.includes('high-context')
    || confidence < 0.7
  ) {
    gates.push('correctness')
  }
  if (riskFlags.includes('security-sensitive') || riskFlags.includes('external-runtime')) {
    gates.push('security')
  }
  return gates
}

export function decideAxisClassification(
  input: AxisClassificationProposal,
  evidence?: AxisClassificationEvidence,
): ComplexityReport {
  const proposal = AxisClassificationProposalSchema.parse(input)
  const confidence = evidence && !evidence.sufficientRepositoryEvidence
    ? Math.min(proposal.confidence, 0.6)
    : proposal.confidence
  const riskFlags = [...new Set([
    ...proposal.riskFlags,
    ...(evidence?.observedRiskFlags ?? []),
  ])]
  const policyAdjustments: Adjustment[] = []
  let score = proposal.score
  let route = proposal.route
  let suggestedWorkers = proposal.suggestedWorkers
  let requiresHumanReview = false

  for (const risk of riskFlags) {
    const floor = SCORE_FLOOR[risk]
    if (score < floor) {
      score = floor
      policyAdjustments.push(SCORE_ADJUSTMENT[risk])
    }
  }

  const risky = riskFlags.some((risk) => (
    risk === 'destructive'
    || risk === 'security-sensitive'
    || risk === 'external-runtime'
  ))
  if (risky) {
    requiresHumanReview = true
    policyAdjustments.push('risk-human-review-required')
  }

  if (confidence < 0.7) {
    score = Math.max(score, 4)
    requiresHumanReview = true
    policyAdjustments.push('low-confidence-human-review-required')
    if (route !== 'single-agent' || suggestedWorkers !== 1) {
      route = 'single-agent'
      suggestedWorkers = 1
      policyAdjustments.push('low-confidence-fan-out-disabled')
    }
  }

  const gates = requiredAxisGatesForRiskFlags(riskFlags, confidence)

  return ComplexityReportSchema.parse({
    ...proposal,
    confidence,
    policyAdjustments: [...new Set(policyAdjustments)],
    requiredGates: gates,
    requiresHumanReview,
    riskFlags,
    route,
    schemaVersion: 1,
    score,
    suggestedWorkers,
  })
}

function isSecuritySensitivePath(file: string): boolean {
  return /(^|[-_.\/])(auth|permission|security|secret|credential|ipc|preload|execution-authority|capability)([-_.\/]|$)/.test(file)
}

function isExternalRuntimePath(file: string): boolean {
  return /(^|[-_.\/])(provider|plugin|runtime|command|terminal|mcp|network)([-_.\/]|$)/.test(file)
}

function isDestructivePath(file: string): boolean {
  return /(^|[-_.\/])(migration|rollback|delete|restore|transaction|file-system)([-_.\/]|$)/.test(file)
}

function isSecuritySensitiveText(value: string): boolean {
  return /\b(auth|authorization|permission|security|secret|credential|ipc|preload|capability)\b|认证|授权|权限|安全|密钥|秘密|凭据|预加载|能力/.test(value)
}

function isExternalRuntimeText(value: string): boolean {
  return /\b(provider|plugin|runtime|command|terminal|mcp|network|external process)\b|提供商|插件|运行时|命令|终端|网络|外部进程/.test(value)
}

function isDestructiveText(value: string): boolean {
  const destructiveOperation = /\b(drop|migration|migrate|rollback|restore|overwrite|destructive)\b|迁移|回滚|恢复|覆盖|破坏性/.test(value)
  const destructiveTarget = /\b(file|directory|database|table|column|schema|record|data|checkpoint|history|workspace|project)\b|文件|目录|数据库|数据表|列|模式|记录|数据|检查点|历史|工作区|项目/.test(value)
  const removal = /\b(delete|remove|replace)\b|删除|移除|替换/.test(value)
  return destructiveOperation || (removal && destructiveTarget)
}
