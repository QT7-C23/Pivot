import { describe, expect, it } from 'vitest'
import { buildPlanGenerationPrompt, parseGeneratedPlan } from '../../src/main/services/plan-generation'

describe('plan generation contract', () => {
  it('parses fenced provider JSON into structured steps', () => {
    const plan = parseGeneratedPlan('```json\n{"title":"Add search","steps":[{"title":"Inspect","description":"Read store","targets":["src/store.ts"]}]}\n```', 'add search')
    expect(plan).toEqual({ source: 'add search', title: 'Add search', steps: [{ title: 'Inspect', description: 'Read store', targets: ['src/store.ts'] }] })
  })

  it('falls back to a verifiable baseline and explicitly requests read-only planning', () => {
    expect(parseGeneratedPlan('not json', 'Add export').steps).toHaveLength(3)
    expect(buildPlanGenerationPrompt('Add export')).toContain('Do not edit files or run commands')
  })
})
