import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  AxisTrustedGateProfileAdapter,
  pivotTrustedGateProfile,
} from '../../src/main/services/axis-trusted-gate-profile-adapter'

describe('Axis trusted Gate profile Main Adapter', () => {
  it('provides a fixed Pivot profile with no shell or project-supplied command text', () => {
    expect(pivotTrustedGateProfile()).toMatchObject({
      commands: [
        { command: process.platform === 'win32' ? 'npm.cmd' : 'npm', gate: 'compile' },
        { command: process.platform === 'win32' ? 'npm.cmd' : 'npm', gate: 'test' },
        { args: ['run', 'verify:mvp'], gate: 'correctness' },
        { args: ['audit', '--audit-level=high', '--omit=dev', '--ignore-scripts'], gate: 'security' },
      ],
      profileId: 'pivot-typescript-strict',
    })
  })

  it('resolves only an explicitly bound canonical project root and returns immutable copies', () => {
    const projectRoot = path.resolve('D:/projects/pivot')
    const adapter = new AxisTrustedGateProfileAdapter({
      profile: profile(),
      projects: projects(projectRoot),
    })

    const resolved = adapter.resolve({ projectRoot, sessionId: 'session-1' })
    expect(resolved?.profileId).toBe('pivot-strict')
    expect(adapter.resolve({ projectRoot: path.resolve('D:/projects/other'), sessionId: 'session-1' })).toBeNull()
    expect(adapter.resolve({ projectRoot, sessionId: 'session-other' })).toBeNull()
    expect(() => resolved?.commands.push(resolved.commands[0]!)).toThrow()
  })

  it('rejects malformed trusted profiles before resolution', () => {
    const projectRoot = path.resolve('D:/projects/pivot')
    expect(() => new AxisTrustedGateProfileAdapter({
      profile: { ...profile(), hidden: true } as never,
      projects: projects(projectRoot),
    })).toThrow()
  })
})

function profile() {
  return {
    commands: [{ args: ['-e', 'process.exit(0)'], command: 'node', gate: 'compile' as const, timeoutMs: 5_000 }],
    profileId: 'pivot-strict',
    schemaVersion: 1 as const,
  }
}

function projects(projectRoot: string) {
  return {
    findBySession(sessionId: string) {
      return sessionId === 'session-1'
        ? { boundAt: '2026-08-13T00:00:00.000Z', projectId: 'project-1', projectRoot, schemaVersion: 1 as const, sessionId }
        : null
    },
  }
}
