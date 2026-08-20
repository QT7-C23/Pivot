import { describe, expect, it, vi } from 'vitest'
import { AxisMainPivotPlanningContextAdapter } from '../../src/main/services/axis-pivot-planning-context-adapter'

describe('Axis Main Pivot planning-context adapter', () => {
  it('resolves the file scope from the authoritative Session Project Binding', async () => {
    const list = vi.fn(async () => ['src/main/app.ts', 'src/shared/contracts.ts'])
    const adapter = new AxisMainPivotPlanningContextAdapter({
      files: { list },
      projects: {
        findBySession: () => ({
          boundAt: '2026-07-29T00:00:00.000Z',
          projectId: 'project-1',
          projectRoot: 'D:\\project',
          schemaVersion: 1,
          sessionId: 'session-1',
        }),
      },
    })

    await expect(adapter.resolve({
      runId: 'run-1',
      sessionId: 'session-1',
    })).resolves.toEqual({
      availableFiles: ['src/main/app.ts', 'src/shared/contracts.ts'],
      constraints: [
        'Planning only. Do not execute tools or mutate project files.',
        'Preserve the source objective and stay within the authoritative project file scope.',
      ],
    })
    expect(list).toHaveBeenCalledWith('D:\\project')
  })

  it('fails before file listing for a missing binding or caller-selected project root', async () => {
    const list = vi.fn(async () => ['src/main/app.ts'])
    const adapter = new AxisMainPivotPlanningContextAdapter({
      files: { list },
      projects: { findBySession: () => null },
    })

    await expect(adapter.resolve({
      runId: 'run-1',
      sessionId: 'session-missing',
    })).rejects.toThrow(/binding/i)
    await expect(adapter.resolve({
      projectRoot: 'D:\\forged',
      runId: 'run-1',
      sessionId: 'session-missing',
    } as never)).rejects.toThrow()
    expect(list).not.toHaveBeenCalled()
  })
})
