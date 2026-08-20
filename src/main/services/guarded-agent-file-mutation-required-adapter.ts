import type { AgentFileMutationPort } from './agent-tool-ports'

export class GuardedAgentFileMutationRequiredAdapter implements AgentFileMutationPort {
  async write(_request: Parameters<AgentFileMutationPort['write']>[0]): Promise<never> {
    throw new Error('Agent file mutation requires a reviewed Guarded Safe Write proposal')
  }
}
