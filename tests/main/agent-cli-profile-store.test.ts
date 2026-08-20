import { mkdir, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AgentCliProfileStore } from '../../src/main/services/agent-cli-profile-store'

let tempRoot = ''

beforeEach(async () => {
  tempRoot = path.join(os.tmpdir(), `pivot-agent-profile-${Date.now()}`)
  await mkdir(tempRoot, { recursive: true })
})

afterEach(async () => {
  await rm(tempRoot, { recursive: true, force: true })
})

describe('AgentCliProfileStore', () => {
  it('starts with no selected profile', () => {
    const store = new AgentCliProfileStore(':memory:')

    expect(store.getSelectedProfileId()).toBeNull()

    store.close()
  })

  it('persists selected profile id when reopened', () => {
    const databasePath = path.join(tempRoot, 'pivot.sqlite')
    const firstStore = new AgentCliProfileStore(databasePath)
    firstStore.setSelectedProfileId('claude')
    firstStore.close()

    const secondStore = new AgentCliProfileStore(databasePath)

    expect(secondStore.getSelectedProfileId()).toBe('claude')

    secondStore.close()
  })

  it('persists custom profile config when reopened', () => {
    const databasePath = path.join(tempRoot, 'pivot.sqlite')
    const firstStore = new AgentCliProfileStore(databasePath)
    firstStore.setCustomProfileConfig({
      adapterArgs: ['run', '{{prompt}}'],
      adapterCommand: 'pivot-agent',
      updateCommand: { args: ['self-update'], command: 'pivot-agent' },
      versionCommand: { args: ['--version'], command: 'pivot-agent' },
    })
    firstStore.close()

    const secondStore = new AgentCliProfileStore(databasePath)

    expect(secondStore.getCustomProfileConfig()).toEqual({
      adapterArgs: ['run', '{{prompt}}'],
      adapterCommand: 'pivot-agent',
      updateCommand: { args: ['self-update'], command: 'pivot-agent' },
      versionCommand: { args: ['--version'], command: 'pivot-agent' },
    })

    secondStore.close()
  })
})
