import type {
  AxisPivotGuardedContinuationAttempt,
  AxisPivotGuardedContinuationRequest,
} from '../../shared/axis-pivot-guarded-continuation-contracts'
import { AxisPivotContinuationAttemptRegistry } from './axis-pivot-continuation-attempt-registry'
import { AxisPivotGuardedContinuationConsumer } from './axis-pivot-guarded-continuation-consumer'
import type {
  AxisGuardedSafeWriteSubmissionPort,
  AxisPivotContinuationAuthorizationPort,
} from './axis-pivot-guarded-continuation-ports'

export interface AxisPivotGuardedContinuationRuntime {
  close(): void
  consume(
    request: AxisPivotGuardedContinuationRequest,
  ): Promise<AxisPivotGuardedContinuationAttempt>
  deleteForSession(sessionId: string): void
  findAttempts(handoffId: string): AxisPivotGuardedContinuationAttempt[]
  readonly ready: Promise<void>
}

export function createAxisPivotGuardedContinuationRuntime(options: {
  authorization: AxisPivotContinuationAuthorizationPort | null
  databasePath?: string
  submissions: AxisGuardedSafeWriteSubmissionPort | null
}): AxisPivotGuardedContinuationRuntime | null {
  if (!options.authorization || !options.submissions) return null
  const attempts = new AxisPivotContinuationAttemptRegistry(
    options.databasePath ?? ':memory:',
  )
  const consumer = new AxisPivotGuardedContinuationConsumer({
    attempts,
    authorization: options.authorization,
    submissions: options.submissions,
  })
  const ready = Promise.resolve().then(() => {
    attempts.recoverInterrupted()
  })
  let closed = false
  return Object.freeze({
    close() {
      if (closed) return
      closed = true
      attempts.close()
    },
    async consume(request: AxisPivotGuardedContinuationRequest) {
      await ready
      return consumer.consume(request)
    },
    deleteForSession: (sessionId: string) => attempts.deleteForSession(sessionId),
    findAttempts: (handoffId: string) => attempts.listForHandoff(handoffId),
    ready,
  })
}
