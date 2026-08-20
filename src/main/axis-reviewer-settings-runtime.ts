import type { ProviderStore } from './services/provider-store'
import { AiSdkAxisReviewerQualificationAdapter } from './services/ai-sdk-axis-reviewer-qualification-adapter'
import { AxisReviewerQualificationRegistry } from './services/axis-reviewer-qualification-registry'
import { AxisReviewerQualificationService } from './services/axis-reviewer-qualification-service'
import { AxisReviewerRoutingStore } from './services/axis-reviewer-routing-store'
import { createAxisSemanticReviewProductionRuntimeFromRouting } from './services/axis-semantic-review-production-config'
import { registerAxisReviewerSettingsIpc } from './axis-reviewer-settings-ipc'

export function createAxisReviewerSettingsRuntime(providers: ProviderStore, databasePath?: string) {
  const qualifications = new AxisReviewerQualificationRegistry(databasePath)
  const routing = new AxisReviewerRoutingStore({ databasePath, providers, qualifications })
  const qualification = new AxisReviewerQualificationService({
    evidence: qualifications,
    providers,
    runner: new AiSdkAxisReviewerQualificationAdapter(),
  })
  registerAxisReviewerSettingsIpc({ qualification, routing })
  const qualified = routing.readQualified()
  return Object.freeze({
    close() { routing.close(); qualifications.close() },
    semanticReview: qualified ? createAxisSemanticReviewProductionRuntimeFromRouting(providers, qualified) : undefined,
  })
}
