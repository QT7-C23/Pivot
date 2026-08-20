import { describe, expect, it } from 'vitest'
import { PlanRegistry } from '../../src/main/services/plan-registry'

describe('PlanRegistry', () => {
  it('lists plans across sessions for the unified work center', () => {
    const plans = new PlanRegistry()
    plans.create('session-1', { source: 'First', steps: [{ description: '', targets: [], title: 'One' }], title: 'First' })
    plans.create('session-2', { source: 'Second', steps: [{ description: '', targets: [], title: 'Two' }], title: 'Second' })
    expect(plans.listAll().map((plan) => plan.sessionId).sort()).toEqual(['session-1', 'session-2'])
    plans.close()
  })

  it('persists refinement, approval, selection, and execution status', () => {
    const plans = new PlanRegistry()
    const created = plans.create('session-1', {
      source: 'Add search',
      steps: [
        { description: 'Inspect the store', targets: ['src/store.ts'], title: 'Inspect' },
        { description: 'Add tests', targets: ['tests/store.test.ts'], title: 'Test' },
      ],
      title: 'Search plan',
    })
    const refined = plans.updateDraft(created.id, {
      source: created.source,
      steps: created.steps.map((step) => ({ description: `${step.description}.`, targets: step.targets, title: step.title })),
      title: created.title,
    })
    const approved = plans.approve(created.id, 'selective', [refined.steps[1]!.id])
    expect(plans.nextPending(created.id)?.id).toBe(approved.steps[1]!.id)
    plans.setStatus(created.id, 'executing')
    const running = plans.setStepStatus(created.id, approved.steps[1]!.id, 'running')

    expect(refined.version).toBe(2)
    expect(approved.steps.map((step) => [step.selected, step.status])).toEqual([[false, 'skipped'], [true, 'pending']])
    expect(running).toMatchObject({ executionMode: 'selective', status: 'executing' })
    expect(plans.nextPending(created.id)).toBeNull()
    plans.close()
  })
})
