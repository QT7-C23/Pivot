import {
  AttentionHistorySchema,
  AttentionLifecycleRequestSchema,
  AttentionObservationSchema,
  AttentionRecordSchema,
  type AttentionLifecycleRequest,
  type AttentionObservation,
  type AttentionRecord,
} from '../../shared/attention'

type AttentionChannel = 'attention:list' | 'attention:observe' | 'attention:resolve' | 'attention:reopen'

export type AttentionInvoke = (
  channel: AttentionChannel,
  request: AttentionLifecycleRequest | AttentionObservation | undefined,
) => Promise<unknown>

export interface AttentionClientPort {
  list(): Promise<AttentionRecord[]>
  observe(observation: AttentionObservation): Promise<AttentionRecord>
  resolve(request: AttentionLifecycleRequest): Promise<AttentionRecord>
  reopen(request: AttentionLifecycleRequest): Promise<AttentionRecord>
}

export function createAttentionClient(
  invoke: AttentionInvoke = (channel, request) => window.pivot.invoke(channel, request as never),
): AttentionClientPort {
  return Object.freeze({
    async list() {
      return AttentionHistorySchema.parse(await invoke('attention:list', undefined))
    },
    async observe(input: AttentionObservation) {
      const observation = AttentionObservationSchema.parse(input)
      return AttentionRecordSchema.parse(await invoke('attention:observe', observation))
    },
    async resolve(input: AttentionLifecycleRequest) {
      const request = AttentionLifecycleRequestSchema.parse(input)
      return AttentionRecordSchema.parse(await invoke('attention:resolve', request))
    },
    async reopen(input: AttentionLifecycleRequest) {
      const request = AttentionLifecycleRequestSchema.parse(input)
      return AttentionRecordSchema.parse(await invoke('attention:reopen', request))
    },
  })
}
