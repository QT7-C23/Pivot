import type {
  AgentAdapterInfo,
  AgentCliCustomProfileConfig,
  AgentCliMaintenanceAction,
  AgentCliMaintenanceResult,
  AgentCliProfile,
  AgentCliProfileId,
} from '../../shared/types/domain'

export const agentService = {
  info(): Promise<AgentAdapterInfo> {
    return window.pivot.invoke('agent:info', undefined)
  },

  profiles(): Promise<AgentCliProfile[]> {
    return window.pivot.invoke('agent:profiles', undefined)
  },

  configureCustomProfile(config: AgentCliCustomProfileConfig): Promise<AgentCliProfile> {
    return window.pivot.invoke('agent:configure-custom-profile', config)
  },

  runCliMaintenance(
    profileId: AgentCliProfileId,
    action: AgentCliMaintenanceAction,
  ): Promise<AgentCliMaintenanceResult> {
    return window.pivot.invoke('agent:run-cli-maintenance', { action, profileId })
  },

  selectProfile(profileId: AgentCliProfileId): Promise<AgentAdapterInfo> {
    return window.pivot.invoke('agent:select-profile', { profileId })
  },
}
