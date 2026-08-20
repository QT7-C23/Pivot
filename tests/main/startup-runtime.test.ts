import { describe, expect, it, vi } from 'vitest'
import { initializeStartupRuntime } from '../../src/main/services/startup-runtime'

describe('startup runtime initialization', () => {
  it('uses the persistent database when initialization succeeds', () => {
    const createRuntime = vi.fn((databasePath: string) => ({ databasePath }))

    const result = initializeStartupRuntime('C:\\Pivot\\pivot.sqlite', createRuntime)

    expect(result).toEqual({
      databasePath: 'C:\\Pivot\\pivot.sqlite',
      recovered: false,
      runtime: { databasePath: 'C:\\Pivot\\pivot.sqlite' },
    })
    expect(createRuntime).toHaveBeenCalledOnce()
  })

  it('falls back to an in-memory runtime when the persistent database cannot open', () => {
    const createRuntime = vi.fn((databasePath: string) => {
      if (databasePath !== ':memory:') throw new Error('unable to open database file')
      return { databasePath }
    })

    const result = initializeStartupRuntime('C:\\Pivot\\pivot.sqlite', createRuntime)

    expect(result.databasePath).toBe(':memory:')
    expect(result.recovered).toBe(true)
    expect(result.runtime).toEqual({ databasePath: ':memory:' })
    expect(result.primaryError?.message).toBe('unable to open database file')
    expect(createRuntime).toHaveBeenNthCalledWith(1, 'C:\\Pivot\\pivot.sqlite')
    expect(createRuntime).toHaveBeenNthCalledWith(2, ':memory:')
  })
})
