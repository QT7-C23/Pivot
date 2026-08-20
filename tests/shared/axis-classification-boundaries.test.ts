import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const source = (filePath: string): string => readFileSync(path.resolve(filePath), 'utf8')

describe('Axis classification module boundaries', () => {
  it('keeps policy code-owned, Main-only and independent from execution infrastructure', () => {
    const policy = source('src/main/services/axis-classification-policy.ts')
    const evaluator = source('src/main/services/axis-complexity-evaluator.ts')
    const decomposer = source('src/main/services/axis-task-decomposer.ts')
    const guardedWrite = source('src/main/services/axis-guarded-safe-write.ts')

    expect(policy).toContain('decideAxisClassification')
    expect(policy).toContain('extractAxisClassificationEvidence')
    expect(evaluator).toContain('decideAxisClassification')
    expect(evaluator).toContain('extractAxisClassificationEvidence')
    expect(decomposer).toContain("extractAxisClassificationEvidence({")
    expect(decomposer).toContain("}, 'candidate-files', objective)")
    expect(decomposer).toContain('requiredGates: classification.requiredGates')
    expect(guardedWrite).toContain('this.gates.supports(input.projectRoot, input.sessionId, task.requiredGates)')
    expect(guardedWrite.indexOf('this.gates.supports(input.projectRoot, input.sessionId, task.requiredGates)')).toBeLessThan(
      guardedWrite.indexOf('this.grantCollector.collect'),
    )
    expect(policy).not.toMatch(
      /better-sqlite3|node:fs|AgentRuntime|BrowserWindow|ipcMain|renderer\/|PermissionManager|FileCheckpointStore|SafeFileWriter/,
    )
  })

  it('keeps model proposals structurally unable to select policy results', () => {
    const contracts = source('src/shared/axis-engine-contracts.ts')
    const model = source('src/main/services/ai-sdk-axis-planning-model.ts')

    expect(model).toContain('AxisClassificationProposalSchema')
    expect(model).toContain('TaskDagProposalSchema')
    expect(model).not.toContain('this.generate(ComplexityReportSchema')
    expect(model).not.toContain('this.generate(TaskDagSchema')
    expect(contracts).toContain('AxisClassificationProposalSchema')
    expect(contracts).toContain('ComplexityReportSchema')
  })
})
