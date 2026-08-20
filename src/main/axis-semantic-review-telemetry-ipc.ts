import { handle } from './ipc-registration'
import type { AxisGuardedIpcRuntime } from './services/axis-guarded-ipc-runtime'
import { AxisSemanticReviewTelemetryService } from './services/axis-semantic-review-telemetry-service'

export function registerAxisSemanticReviewTelemetryIpc(options: {
  authorizeSession(sessionId: string): void
  guarded: Pick<AxisGuardedIpcRuntime, 'featureState' | 'openSemanticReviewTelemetryReaderPort'>
}): void {
  const reader = options.guarded.openSemanticReviewTelemetryReaderPort()
  handle('axis:list-semantic-review-telemetry', async (request) => {
    options.authorizeSession(request.sessionId)
    return reader?.list(request) ?? AxisSemanticReviewTelemetryService.unavailable(
      options.guarded.featureState().enabled ? 'not-configured' : 'disabled',
    )
  })
}
