import type { PlanDraftInput } from '../../shared/types/domain'

export function buildPlanGenerationPrompt(source: string): string {
  return [
    'Create a read-only implementation plan for the request below.',
    'Do not edit files or run commands. You may only inspect and search the project.',
    'Return only JSON with this exact shape:',
    '{"title":"...","steps":[{"title":"...","description":"...","targets":["relative/path"]}]}',
    'Use concrete, independently verifiable steps and include a final validation step.',
    '',
    `Request: ${source.trim()}`,
  ].join('\n')
}

export function parseGeneratedPlan(response: string | null, source: string): PlanDraftInput {
  const raw = response?.trim() ?? ''
  const json = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? raw.match(/\{[\s\S]*\}/)?.[0]
  if (json) {
    try {
      const parsed = JSON.parse(json) as { title?: unknown; steps?: unknown }
      if (typeof parsed.title === 'string' && Array.isArray(parsed.steps)) {
        const steps = parsed.steps.flatMap((candidate) => {
          if (!candidate || typeof candidate !== 'object') return []
          const value = candidate as Record<string, unknown>
          if (typeof value['title'] !== 'string') return []
          return [{
            description: typeof value['description'] === 'string' ? value['description'] : '',
            targets: Array.isArray(value['targets']) ? value['targets'].filter((target): target is string => typeof target === 'string') : [],
            title: value['title'],
          }]
        })
        if (steps.length > 0) return { source, steps, title: parsed.title }
      }
    } catch {
      // Fall through to a safe baseline plan when a provider returns non-JSON prose.
    }
  }
  const title = source.trim().split(/\r?\n/)[0]?.slice(0, 80) || 'Implementation plan'
  return {
    source,
    steps: [
      { description: 'Inspect the relevant project contracts, implementation, and tests.', targets: [], title: 'Inspect the current implementation' },
      { description: 'Implement the requested change in small, contract-safe increments.', targets: [], title: 'Implement the change' },
      { description: 'Run focused tests, the full regression suite, and the production build.', targets: [], title: 'Verify the result' },
    ],
    title,
  }
}

export function buildPlanStepPrompt(planTitle: string, source: string, step: { description: string; targets: string[]; title: string }): string {
  return [
    `Execute one approved step from plan "${planTitle}".`,
    `Original request: ${source}`,
    `Step: ${step.title}`,
    `Instructions: ${step.description}`,
    step.targets.length > 0 ? `Planned targets: ${step.targets.join(', ')}` : 'Planned targets: discover within the project boundary.',
    'Do only this step. Preserve module contracts and verify the step before reporting completion.',
  ].join('\n')
}
