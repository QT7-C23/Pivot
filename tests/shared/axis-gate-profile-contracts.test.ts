import { describe, expect, it } from 'vitest'
import { AxisGateProfileSchema } from '../../src/shared/axis-gate-profile-contracts'

describe('Axis trusted Gate profile contracts', () => {
  it('accepts one ordered, bounded command definition per supported Gate', () => {
    expect(AxisGateProfileSchema.parse(profile()).commands.map(({ gate }) => gate)).toEqual([
      'compile',
      'test',
      'correctness',
      'security',
    ])
  })

  it('rejects unknown fields, executable paths, duplicate Gates, and invalid order', () => {
    expect(() => AxisGateProfileSchema.parse({ ...profile(), hidden: true })).toThrow()
    expect(() => AxisGateProfileSchema.parse({
      ...profile(),
      commands: [{ ...profile().commands[0], command: 'C:\\tools\\npm.cmd' }],
    })).toThrow(/executable name/i)
    expect(() => AxisGateProfileSchema.parse({
      ...profile(),
      commands: [profile().commands[0], profile().commands[0]],
    })).toThrow(/unique/i)
    expect(() => AxisGateProfileSchema.parse({
      ...profile(),
      commands: [profile().commands[1], profile().commands[0]],
    })).toThrow(/order/i)
  })
})

function profile() {
  const command = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  return {
    commands: [
      { args: ['exec', 'tsc', '--', '--noEmit'], command, gate: 'compile' as const, timeoutMs: 120_000 },
      { args: ['exec', 'vitest', 'run'], command, gate: 'test' as const, timeoutMs: 120_000 },
      { args: ['run', 'verify:mvp'], command, gate: 'correctness' as const, timeoutMs: 120_000 },
      { args: ['audit', '--audit-level=high'], command, gate: 'security' as const, timeoutMs: 120_000 },
    ],
    profileId: 'pivot-strict',
    schemaVersion: 1 as const,
  }
}
