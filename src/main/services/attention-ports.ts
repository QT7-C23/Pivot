import type {
  AttentionLifecycleRequest,
  AttentionObservation,
  AttentionRecord,
} from '../../shared/attention'

export interface AttentionReaderPort {
  list(): AttentionRecord[]
}

export interface AttentionObservationPort {
  observe(observation: AttentionObservation): AttentionRecord
}

export interface AttentionLifecyclePort {
  resolve(request: AttentionLifecycleRequest): AttentionRecord
  reopen(request: AttentionLifecycleRequest): AttentionRecord
}
