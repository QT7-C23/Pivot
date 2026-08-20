import { describe, expect, it } from 'vitest'
import { AxisDryRunQualityEvaluator } from '../../src/main/services/axis-execution-quality'
import { AxisCheckpointEvaluationSchema, AxisPermissionEvaluationSchema, AxisReviewEvaluationSchema } from '../../src/shared/axis-engine-contracts'
import { axisShadowResult } from '../fixtures/axis-shadow-run'

describe('Axis execution quality evaluator', () => {
  it('produces explicit simulation-only permission, checkpoint, and review evidence', async () => {
    const task = axisShadowResult().dag!.tasks[0]!
    const evaluator = new AxisDryRunQualityEvaluator()
    const input = { runId: 'run-1', sessionId: 'session-1', task }

    const permission = await evaluator.evaluatePermission(input)
    const checkpoint = await evaluator.evaluateCheckpoint(input)
    const review = await evaluator.review({ ...input, attempt: 1, result: {
      artifacts: [], findings: [], status: 'completed', summary: 'simulation', taskId: task.id,
      usage: { costUsd: 0, durationMs: 0, tokens: 0 },
    } })

    expect(AxisPermissionEvaluationSchema.parse(permission)).toMatchObject({ authority: 'simulation', requestedTools: ['read'], status: 'allowed' })
    expect(AxisCheckpointEvaluationSchema.parse(checkpoint)).toMatchObject({ authority: 'simulation', filePaths: [], status: 'skipped' })
    expect(AxisReviewEvaluationSchema.parse(review)).toMatchObject({ authority: 'simulation', status: 'passed' })
    expect(permission.evidence.join(' ')).toMatch(/no runtime tool authority/i)
  })

  it('rejects review contracts whose aggregate status disagrees with gate evidence', () => {
    expect(() => AxisReviewEvaluationSchema.parse({
      authority: 'simulation', gates: [{ durationMs: 0, evidence: ['failed'], gate: 'correctness', status: 'failed', taskId: 'inspect' }],
      status: 'passed', summary: 'incorrect aggregate', taskId: 'inspect',
    })).toThrow(/status/i)
  })
})
