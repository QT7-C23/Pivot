import { describe, expect, it } from 'vitest'
import { inferPermissionRisk } from '../../src/renderer/components/agent-status-panel'

describe('inferPermissionRisk', () => {
  it('treats destructive operations as high risk', () => {
    expect(inferPermissionRisk({
      input: { command: 'rm -rf dist' },
      requestId: 'high',
      runId: 'run-1',
      sessionId: 'session-1',
      toolName: 'shell',
    })).toBe('high')
  })

  it('treats writes and command execution as medium risk', () => {
    expect(inferPermissionRisk({
      input: { filePath: 'src/app.ts' },
      requestId: 'medium',
      runId: 'run-1',
      sessionId: 'session-1',
      toolName: 'write_file',
    })).toBe('medium')
  })

  it('keeps read-only tools low risk', () => {
    expect(inferPermissionRisk({
      input: { filePath: 'README.md' },
      requestId: 'low',
      runId: 'run-1',
      sessionId: 'session-1',
      toolName: 'read_file',
    })).toBe('low')
  })
})
