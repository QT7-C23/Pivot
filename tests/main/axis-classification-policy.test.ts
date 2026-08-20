import { describe, expect, it } from 'vitest'
import {
  decideAxisClassification,
  extractAxisClassificationEvidence,
} from '../../src/main/services/axis-classification-policy'

describe('Axis classification policy', () => {
  it('raises security-sensitive underclassification and forces security review', () => {
    const decision = decideAxisClassification({
      confidence: 0.95,
      reasons: ['Model called the change small'],
      riskFlags: ['security-sensitive'],
      route: 'single-agent',
      score: 1,
      suggestedWorkers: 1,
    })

    expect(decision).toMatchObject({
      confidence: 0.95,
      requiredGates: ['compile', 'test', 'security'],
      requiresHumanReview: true,
      route: 'single-agent',
      score: 4,
      schemaVersion: 1,
      suggestedWorkers: 1,
    })
    expect(decision.policyAdjustments).toContain('score-raised-for-security-sensitive')
  })

  it('fails closed when confidence is low and prevents speculative fan-out', () => {
    const decision = decideAxisClassification({
      confidence: 0.4,
      reasons: ['Insufficient repository context'],
      riskFlags: [],
      route: 'multi-agent',
      score: 3,
      suggestedWorkers: 6,
    })

    expect(decision).toMatchObject({
      requiredGates: ['compile', 'test', 'correctness'],
      requiresHumanReview: true,
      route: 'single-agent',
      score: 4,
      suggestedWorkers: 1,
    })
    expect(decision.policyAdjustments).toEqual(expect.arrayContaining([
      'low-confidence-human-review-required',
      'low-confidence-fan-out-disabled',
    ]))
  })

  it('keeps a confident narrow proposal narrow with baseline gates', () => {
    expect(decideAxisClassification({
      confidence: 0.98,
      reasons: ['One isolated file'],
      riskFlags: [],
      route: 'single-agent',
      score: 1,
      suggestedWorkers: 1,
    })).toMatchObject({
      policyAdjustments: [],
      requiredGates: ['compile', 'test'],
      requiresHumanReview: false,
      route: 'single-agent',
      score: 1,
      suggestedWorkers: 1,
    })
  })

  it('derives risk evidence from repository paths instead of trusting model omissions', () => {
    const evidence = extractAxisClassificationEvidence({
      availableFiles: [
        'src/main/services/permission-manager.ts',
        'src/shared/ipc-validation.ts',
        'src/renderer/components/chat-workspace.tsx',
      ],
      constraints: [],
    }, 'candidate-files')

    expect(evidence).toEqual({
      fileCount: 3,
      observedRiskFlags: ['cross-module', 'security-sensitive'],
      repositoryScopes: ['main', 'renderer', 'shared'],
      sufficientRepositoryEvidence: true,
    })
    const decision = decideAxisClassification({
      confidence: 0.99,
      reasons: ['Model missed repository risk'],
      riskFlags: [],
      route: 'single-agent',
      score: 1,
      suggestedWorkers: 1,
    }, evidence)
    expect(decision.riskFlags).toEqual(['cross-module', 'security-sensitive'])
    expect(decision.requiredGates).toEqual(['compile', 'test', 'correctness', 'security'])
    expect(decision.requiresHumanReview).toBe(true)
  })

  it('does not treat unrelated files in a repository manifest as task scope', () => {
    const evidence = extractAxisClassificationEvidence({
      availableFiles: [
        'src/main/services/plugin-runtime-adapter.ts',
        'src/shared/ipc-validation.ts',
        'src/renderer/components/button.tsx',
      ],
      constraints: [],
    }, 'repository-manifest')

    expect(evidence.observedRiskFlags).toEqual([])
    expect(evidence.repositoryScopes).toEqual(['main', 'renderer', 'shared'])
  })

  it('derives explicit objective risk when a model omits it', () => {
    const evidence = extractAxisClassificationEvidence({
      availableFiles: ['src/main/services/operation.ts'],
      constraints: [],
    }, 'candidate-files', 'Delete the credential migration and invoke an external plugin command')

    expect(evidence.observedRiskFlags).toEqual([
      'security-sensitive',
      'external-runtime',
      'destructive',
    ])
  })

  it('derives explicit Chinese objective risk when a model omits it', () => {
    const evidence = extractAxisClassificationEvidence({
      availableFiles: ['src/main/services/operation.ts'],
      constraints: [],
    }, 'candidate-files', '删除凭据迁移并调用外部插件命令')

    expect(evidence.observedRiskFlags).toEqual([
      'security-sensitive',
      'external-runtime',
      'destructive',
    ])
  })

  it.each([
    'Remove an unused button and rename its label',
    '删除未使用的按钮并调整卡片间距',
  ])('does not treat ordinary code cleanup as destructive: %s', (objective) => {
    const evidence = extractAxisClassificationEvidence({
      availableFiles: ['src/renderer/components/button.tsx'],
      constraints: [],
    }, 'candidate-files', objective)

    expect(evidence.observedRiskFlags).not.toContain('destructive')
  })

  it('caps confidence when no repository evidence is available', () => {
    const decision = decideAxisClassification({
      confidence: 1,
      reasons: ['Claims certainty without files'],
      riskFlags: [],
      route: 'multi-agent',
      score: 2,
      suggestedWorkers: 4,
    }, extractAxisClassificationEvidence({ availableFiles: [], constraints: [] }))

    expect(decision.confidence).toBe(0.6)
    expect(decision.requiresHumanReview).toBe(true)
    expect(decision.route).toBe('single-agent')
    expect(decision.suggestedWorkers).toBe(1)
  })
})
