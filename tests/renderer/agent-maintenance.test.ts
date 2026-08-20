import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentCliProfile } from '../../src/shared/types/domain'

const agentServiceMock = vi.hoisted(() => ({
  configureCustomProfile: vi.fn(),
  info: vi.fn(),
  profiles: vi.fn(),
  runCliMaintenance: vi.fn(),
  selectProfile: vi.fn(),
}))

vi.mock('../../src/renderer/services/agent.service', () => ({ agentService: agentServiceMock }))

import { useAgentStore } from '../../src/renderer/stores/agent.store'

const claudeProfile: AgentCliProfile = {
  adapterArgs: [],
  adapterCommand: 'claude',
  id: 'claude',
  isSelected: true,
  label: 'Claude Code',
  updateCommand: { args: ['update'], command: 'claude' },
  versionCommand: { args: ['--version'], command: 'claude' },
}

describe('CLI maintenance recovery', () => {
  beforeEach(() => {
    agentServiceMock.runCliMaintenance.mockReset()
    useAgentStore.setState({
      cliProfiles: [claudeProfile],
      error: null,
      lastMaintenanceResult: null,
      maintenanceInProgress: null,
    })
  })

  it('normalizes a remote ENOENT rejection into a recoverable unavailable result', async () => {
    agentServiceMock.runCliMaintenance.mockRejectedValue(new Error("Error invoking remote method 'agent:run-cli-maintenance': Error: spawn claude ENOENT"))

    await useAgentStore.getState().runCliMaintenance('claude', 'version')

    expect(useAgentStore.getState().error).toBeNull()
    expect(useAgentStore.getState().lastMaintenanceResult).toMatchObject({
      action: 'version',
      command: 'claude',
      profileId: 'claude',
      unavailable: true,
    })
  })
})
