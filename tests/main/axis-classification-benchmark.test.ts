import { describe, expect, it } from 'vitest'
import {
  decideAxisClassification,
  extractAxisClassificationEvidence,
} from '../../src/main/services/axis-classification-policy'

describe('Axis classification benchmark replay', () => {
  const cases = [
    {
      expected: { gates: ['compile', 'test'], human: false, score: 1 },
      files: ['src/renderer/components/button.tsx'],
      name: 'isolated presentation change',
    },
    {
      expected: { gates: ['compile', 'test', 'correctness', 'security'], human: true, score: 4 },
      files: ['src/main/ipc-handlers.ts', 'src/shared/ipc-validation.ts', 'src/renderer/services/file.service.ts'],
      name: 'cross-process IPC change',
    },
    {
      expected: { gates: ['compile', 'test', 'security'], human: true, score: 4 },
      files: ['src/main/services/plugin-runtime-adapter.ts'],
      name: 'external plugin runtime change',
    },
    {
      expected: { gates: ['compile', 'test', 'correctness'], human: true, score: 4 },
      files: ['src/main/services/database-migration.ts'],
      name: 'destructive migration change',
    },
    {
      expected: { gates: ['compile', 'test', 'correctness'], human: false, score: 3 },
      files: Array.from({ length: 40 }, (_, index) => `src/renderer/feature-${index}.tsx`),
      name: 'high-context renderer change',
    },
  ] as const

  for (const benchmark of cases) {
    it(benchmark.name, () => {
      const decision = decideAxisClassification({
        confidence: 0.95,
        reasons: ['Benchmark model proposal'],
        riskFlags: [],
        route: 'single-agent',
        score: 1,
        suggestedWorkers: 1,
      }, extractAxisClassificationEvidence({
        availableFiles: [...benchmark.files],
        constraints: [],
      }, 'candidate-files'))

      expect(decision.score).toBe(benchmark.expected.score)
      expect(decision.requiredGates).toEqual(benchmark.expected.gates)
      expect(decision.requiresHumanReview).toBe(benchmark.expected.human)
    })
  }
})
