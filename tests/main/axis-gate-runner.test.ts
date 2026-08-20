import { mkdir, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AxisGateEvidenceRegistry } from '../../src/main/services/axis-gate-evidence-registry'
import { AxisGateRunner } from '../../src/main/services/axis-gate-runner'
import { AxisTrustedGateProfileAdapter } from '../../src/main/services/axis-trusted-gate-profile-adapter'
import { CommandRunner } from '../../src/main/services/command-runner'

let tempRoot = ''
const registries: AxisGateEvidenceRegistry[] = []

beforeEach(async () => {
  tempRoot = path.join(os.tmpdir(), `pivot-axis-gates-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  await mkdir(tempRoot, { recursive: true })
})

afterEach(async () => {
  registries.splice(0).forEach((registry) => registry.close())
  await rm(tempRoot, { recursive: true, force: true })
})

describe('Axis Gate 1 runner', () => {
  it('runs compile, test, and lint sequentially and persists bounded evidence', async () => {
    const databasePath = path.join(tempRoot, 'gates.sqlite')
    const evidence = tracked(new AxisGateEvidenceRegistry(databasePath))
    const runner = new AxisGateRunner({
      profiles: profiles([
        command('compile', "process.stdout.write('compile ok')"),
        command('test', "process.stdout.write('tests ok')"),
        command('lint', "process.stdout.write('lint ok')"),
      ]),
      evidence,
      runner: new CommandRunner(),
    })

    const result = await runner.run(request(['compile', 'test', 'lint']))

    expect(result.status).toBe('passed')
    expect(result.gates.map((gate) => [gate.gate, gate.status])).toEqual([
      ['compile', 'passed'],
      ['test', 'passed'],
      ['lint', 'passed'],
    ])
    expect(result.evidenceIds).toHaveLength(3)
    expect(evidence.listForRun('run-1')).toHaveLength(3)
    evidence.close()
    registries.splice(registries.indexOf(evidence), 1)

    const reopened = tracked(new AxisGateEvidenceRegistry(databasePath))
    expect(reopened.listForTask('run-1', 'task-1').map((entry) => entry.stdout)).toEqual([
      'compile ok',
      'tests ok',
      'lint ok',
    ])
  })

  it('fails fast after a failed gate and records later gates as skipped', async () => {
    const evidence = tracked(new AxisGateEvidenceRegistry())
    const runner = new AxisGateRunner({
      profiles: profiles([
        command('compile', "process.stdout.write('compile ok')"),
        command('test', "process.stderr.write('test failed'); process.exit(2)"),
        command('lint', "process.stdout.write('must not run')"),
      ]),
      evidence,
      runner: new CommandRunner(),
    })

    const result = await runner.run(request(['compile', 'test', 'lint']))

    expect(result.status).toBe('failed')
    expect(result.gates.map((gate) => [gate.gate, gate.status])).toEqual([
      ['compile', 'passed'],
      ['test', 'failed'],
      ['lint', 'skipped'],
    ])
    expect(result.evidenceIds).toHaveLength(2)
    expect(evidence.listForRun('run-1').map((entry) => [entry.gate, entry.exitCode])).toEqual([
      ['compile', 0],
      ['test', 2],
    ])
  })

  it('turns a timeout into failed persistent evidence', async () => {
    const evidence = tracked(new AxisGateEvidenceRegistry())
    const runner = new AxisGateRunner({
      profiles: profiles([command('compile', 'setTimeout(() => {}, 5000)', 20)]),
      evidence,
      runner: new CommandRunner(),
    })

    const result = await runner.run(request(['compile']))

    expect(result).toMatchObject({ status: 'failed' })
    expect(evidence.listForRun('run-1')).toEqual([
      expect.objectContaining({ gate: 'compile', status: 'failed', timedOut: true }),
    ])
  })

  it('fails closed when Gate evidence cannot be persisted', async () => {
    const record = vi.fn(() => {
      throw new Error('gate evidence unavailable')
    })
    const runner = new AxisGateRunner({
      profiles: profiles([command('compile', "process.stdout.write('compile ok')")]),
      evidence: { record },
      runner: new CommandRunner(),
    })

    await expect(runner.run(request(['compile']))).rejects.toThrow(/evidence unavailable/i)
    expect(record).toHaveBeenCalledTimes(1)
  })

  it('runs only the task-required Gates from its exact trusted project profile', async () => {
    const evidence = tracked(new AxisGateEvidenceRegistry())
    const runner = new AxisGateRunner({
      evidence,
      profiles: profiles([
        command('compile', "process.stdout.write('compile ok')"),
        command('test', "process.stdout.write('test ok')"),
        command('correctness', "process.stdout.write('correctness ok')"),
        command('security', "process.stdout.write('security ok')"),
      ]),
      runner: new CommandRunner(),
    })

    expect(runner.supports(tempRoot, 'session-1', ['compile', 'test', 'correctness', 'security'])).toBe(true)
    expect(runner.supports(path.join(tempRoot, 'other'), 'session-1', ['compile'])).toBe(false)
    const result = await runner.run(request(['compile', 'test', 'correctness', 'security']))

    expect(result.gates.map(({ gate, status }) => [gate, status])).toEqual([
      ['compile', 'passed'],
      ['test', 'passed'],
      ['correctness', 'passed'],
      ['security', 'passed'],
    ])
    expect(evidence.listForTask('run-1', 'task-1').map(({ gate }) => gate)).toEqual([
      'compile',
      'test',
      'correctness',
      'security',
    ])
  })
})

function command(gate: 'compile' | 'test' | 'lint' | 'correctness' | 'security', source: string, timeoutMs = 5_000) {
  return {
    args: ['-e', source],
    command: 'node',
    gate,
    timeoutMs,
  }
}

function request(requiredGates: Array<'compile' | 'test' | 'lint' | 'correctness' | 'security'>) {
  return {
    projectRoot: tempRoot,
    requiredGates,
    runId: 'run-1',
    sessionId: 'session-1',
    taskId: 'task-1',
  }
}

function profiles(commands: ReturnType<typeof command>[]) {
  return new AxisTrustedGateProfileAdapter({
    profile: { commands, profileId: 'test-profile', schemaVersion: 1 },
    projects: {
      findBySession: (sessionId) => sessionId === 'session-1'
        ? { boundAt: '2026-08-13T00:00:00.000Z', projectId: 'project-1', projectRoot: tempRoot, schemaVersion: 1, sessionId }
        : null,
    },
  })
}

function tracked(registry: AxisGateEvidenceRegistry): AxisGateEvidenceRegistry {
  registries.push(registry)
  return registry
}
