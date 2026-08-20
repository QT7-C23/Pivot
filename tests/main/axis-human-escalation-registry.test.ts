import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { AxisHumanEscalationRegistry } from '../../src/main/services/axis-human-escalation-registry'

describe('Axis Human Escalation registry', () => {
  it('persists one attention receipt through a frozen narrow Port', () => {
    const registry = createRegistry()
    const port = registry.openEscalationPort()

    const receipt = port.open(escalationInput())

    expect(Object.isFrozen(port)).toBe(true)
    expect(port.findByDecision('pivot-escalate-1')).toEqual(receipt)
    expect(() => port.open(escalationInput())).toThrow(
      /decision|escalation|unique/i,
    )
    registry.close()
  })

  it('strictly rejects malformed create input before persistence', () => {
    const registry = createRegistry()
    const port = registry.openEscalationPort()

    expect(() => port.open({
      ...escalationInput(),
      category: 'minor',
    } as unknown as Parameters<typeof port.open>[0])).toThrow()
    expect(() => port.open({
      ...escalationInput(),
      evidenceIds: ['review-1', 'review-1'],
    })).toThrow(/evidence/i)
    expect(port.findByDecision('pivot-escalate-1')).toBeNull()
    registry.close()
  })

  it('recovers the immutable receipt after database reopen', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'pivot-escalation-'))
    const databasePath = path.join(directory, 'escalations.db')
    try {
      const first = createRegistry(databasePath)
      const receipt = first.openEscalationPort().open(escalationInput())
      first.close()

      const reopened = createRegistry(databasePath)
      expect(reopened.openEscalationPort().findByDecision(
        'pivot-escalate-1',
      )).toEqual(receipt)
      reopened.close()
    } finally {
      await rm(directory, { force: true, recursive: true })
    }
  })
})

function createRegistry(databasePath = ':memory:') {
  let id = 0
  return new AxisHumanEscalationRegistry(databasePath, {
    clock: () => new Date('2026-07-30T00:00:02.000Z'),
    idFactory: () => `escalation-${++id}`,
  })
}

function escalationInput() {
  return {
    category: 'security' as const,
    decisionId: 'pivot-escalate-1',
    evidenceIds: ['review-1'],
    executionRevision: 5,
    reason: 'A human must assess the security impact',
    runId: 'run-1',
    sessionId: 'session-1',
    summary: 'The review found a security-sensitive conflict',
    taskId: 'inspect',
  }
}
