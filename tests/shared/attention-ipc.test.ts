import { describe, expect, it } from 'vitest'
import { validateIpcRequest } from '../../src/shared/ipc-validation'

describe('durable Attention IPC validation', () => {
  it('accepts strict list, observe, resolve and reopen calls', () => {
    expect(validateIpcRequest('attention:list', undefined)).toBeUndefined()
    expect(validateIpcRequest('attention:observe', {
      contextLabel: 'Local Executable', detail: 'Stopped', kind: 'runtime', severity: 'error',
      sourceId: 'runtime:error', title: 'Runtime connection lost',
    })).toMatchObject({ sourceId: 'runtime:error' })
    for (const channel of ['attention:resolve', 'attention:reopen'] as const) {
      expect(validateIpcRequest(channel, {
        attentionId: '11111111-1111-4111-8111-111111111111', expectedRevision: 1,
      })).toMatchObject({ expectedRevision: 1 })
    }
  })

  it('rejects unknown capabilities and malformed lifecycle revisions', () => {
    expect(() => validateIpcRequest('attention:observe', {
      contextLabel: 'Runtime', detail: 'Stopped', filePath: 'D:\\secret.txt', kind: 'runtime',
      severity: 'error', sourceId: 'runtime:error', title: 'Lost',
    })).toThrow(/unknown field|invalid attention/i)
    expect(() => validateIpcRequest('attention:resolve', {
      attentionId: 'not-an-id', expectedRevision: 0, force: true,
    })).toThrow(/unknown field|invalid attention/i)
  })
})
