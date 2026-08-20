import type {
  AgentAdapterInfo,
  AgentCliCustomProfileConfig,
  AgentCliMaintenanceAction,
  AgentCliMaintenanceResult,
  AgentCliProfile,
  AgentCliProfileId,
  AgentClientContext,
  ChatMessage,
  ContextTimelineEntry,
  ContextTimelineRestoreResult,
  FileCheckpointRecord,
  FileCheckpointRestoreResult,
  FileReviewRecord,
  FileReviewResolution,
  FileSearchEntry,
  FileTreeEntry,
  PermissionBehavior,
  PermissionDecision,
  PlanDocument,
  PlanDraftInput,
  PlanExecutionMode,
  ProjectHistoryEntry,
  ProviderConfig,
  ProviderConfigInput,
  ProviderConnectionResult,
  SessionRecord,
  SessionGroupRecord,
  SessionMetadataPatch,
} from './domain'
import type { SignalMap } from '../signal-channel'
import type { ApplicationUpdateState } from '../application-update'
import type {
  ApplicationPreferences,
  ApplicationPreferencesUpdateRequest,
} from '../application-preferences'
import type {
  FeedbackAttachment,
  FeedbackAttachmentDiscardRequest,
  FeedbackRecord,
  FeedbackSubmissionRequest,
} from '../feedback'
import type {
  MarketplaceCatalogReadResult,
  MarketplaceFavoriteCollection,
  MarketplaceFavoriteSetRequest,
} from '../marketplace-contracts'
import type {
  MarketplaceInstallRequest,
  MarketplaceInstallResult,
  MarketplaceInstallationCollection,
  MarketplaceUninstallRequest,
  MarketplaceUpdateDeliveryRequest,
  MarketplaceUpdateDeliveryResult,
} from '../marketplace-delivery-contracts'
import type { MarketplaceUpdateActionRequest, MarketplaceUpdateCollection, MarketplaceUpdateRecord } from '../marketplace-update-contracts'
import type { MarketplacePublicationQualification } from '../marketplace-publication-qualification-contracts'
import type {
  MarketplaceActivationRecord,
  MarketplaceActivationRequest,
  MarketplaceDeactivationRequest,
} from '../marketplace-activation-contracts'
import type {
  MarketplaceActiveResourceCollection,
  MarketplacePluginInvocationRequest,
  MarketplacePluginInvocationResult,
} from '../marketplace-resource-contracts'
import type {
  AttentionLifecycleRequest,
  AttentionObservation,
  AttentionRecord,
} from '../attention'
import type { AxisDryRunApprovalRequest, AxisDryRunFeatureState, AxisRunState, AxisRunStateTransitionRequest, AxisShadowPlanRequest, AxisShadowRunResult, AxisShadowState, EngineTrace } from '../axis-engine-contracts'
import type {
  AxisGuardedSafeWriteFeatureState,
  AxisGuardedSafeWriteSubmission,
  AxisGuardedSafeWriteSubmissionResult,
} from '../axis-guarded-safe-write-contracts'
import type {
  AxisSafeWriteProposalRequest,
  AxisSafeWriteProposalResult,
} from '../axis-safe-write-proposal-contracts'
import type { ProjectCreationRequest, ProjectCreationResult } from '../project-creation'
import type { AxisSemanticReviewTelemetryPage, AxisSemanticReviewTelemetryQuery } from '../axis-semantic-review-telemetry-contracts'
import type { ProviderModelProbeRequest, ProviderModelProbeResult } from '../provider-model-probe-contracts'
import type { AxisReviewerQualificationEvidence, AxisReviewerQualificationRequest, AxisReviewerRoutingConfig, AxisReviewerRoutingUpdate } from '../axis-reviewer-qualification-contracts'

export type { SignalMap } from '../signal-channel'

export interface IPCContract {
  'attention:list': { request: Record<string, never> | undefined; response: AttentionRecord[] }
  'attention:observe': { request: AttentionObservation; response: AttentionRecord }
  'attention:resolve': { request: AttentionLifecycleRequest; response: AttentionRecord }
  'attention:reopen': { request: AttentionLifecycleRequest; response: AttentionRecord }
  'chat:send': { request: { context?: AgentClientContext; sessionId: string; text: string }; response: void }
  'chat:abort': { request: { sessionId: string }; response: void }
  'chat:list': { request: { sessionId: string }; response: ChatMessage[] }
  'chat:permission': { request: { requestId: string; behavior: PermissionDecision }; response: void }
  'agent:info': { request: Record<string, never> | undefined; response: AgentAdapterInfo }
  'agent:profiles': { request: Record<string, never> | undefined; response: AgentCliProfile[] }
  'agent:select-profile': { request: { profileId: AgentCliProfileId }; response: AgentAdapterInfo }
  'agent:configure-custom-profile': {
    request: AgentCliCustomProfileConfig
    response: AgentCliProfile
  }
  'agent:run-cli-maintenance': {
    request: { action: AgentCliMaintenanceAction; profileId: AgentCliProfileId }
    response: AgentCliMaintenanceResult
  }
  'axis:shadow-state': { request: Record<string, never> | undefined; response: AxisShadowState }
  'axis:set-shadow-enabled': { request: { enabled: boolean }; response: AxisShadowState }
  'axis:plan-shadow': { request: AxisShadowPlanRequest; response: AxisShadowRunResult }
  'axis:list-traces': { request: { sessionId: string }; response: EngineTrace[] }
  'axis:list-shadow-runs': { request: { sessionId: string }; response: AxisShadowRunResult[] }
  'axis:list-run-states': { request: { sessionId: string }; response: AxisRunState[] }
  'axis:cancel-run': { request: AxisRunStateTransitionRequest; response: AxisRunState }
  'axis:restart-run': { request: AxisRunStateTransitionRequest; response: AxisRunState }
  'axis:dry-run-state': { request: Record<string, never> | undefined; response: AxisDryRunFeatureState }
  'axis:set-dry-run-enabled': { request: { enabled: boolean }; response: AxisDryRunFeatureState }
  'axis:execute-dry-run': { request: AxisDryRunApprovalRequest; response: AxisRunState }
  'axis:guarded-safe-write-state': {
    request: Record<string, never> | undefined
    response: AxisGuardedSafeWriteFeatureState
  }
  'axis:propose-guarded-safe-write': {
    request: AxisSafeWriteProposalRequest
    response: AxisSafeWriteProposalResult
  }
  'axis:execute-guarded-safe-write': {
    request: AxisGuardedSafeWriteSubmission
    response: AxisGuardedSafeWriteSubmissionResult
  }
  'axis:list-semantic-review-telemetry': {
    request: AxisSemanticReviewTelemetryQuery
    response: AxisSemanticReviewTelemetryPage
  }

  'fs:tree': { request: { sessionId: string }; response: FileTreeEntry[] }
  'fs:children': { request: { dirPath: string; sessionId: string }; response: FileTreeEntry[] }
  'fs:read': { request: { filePath: string; sessionId: string }; response: string }
  'fs:search': { request: { limit?: number; query: string; sessionId: string }; response: FileSearchEntry[] }
  'fs:watch': { request: { sessionId: string }; response: void }
  'fs:create-file': { request: { parentPath: string; name: string; sessionId: string }; response: FileTreeEntry }
  'fs:create-directory': { request: { parentPath: string; name: string; sessionId: string }; response: FileTreeEntry }
  'fs:reveal': { request: { filePath: string; sessionId: string }; response: void }
  'fs:checkpoint': { request: { sessionId: string; filePath: string }; response: FileCheckpointRecord }
  'fs:list-checkpoints': { request: { sessionId: string }; response: FileCheckpointRecord[] }
  'fs:restore-checkpoint': { request: { checkpointId: string }; response: FileCheckpointRestoreResult }
  'fs:list-reviews': { request: { sessionId: string; includeResolved?: boolean }; response: FileReviewRecord[] }
  'fs:get-review': { request: { reviewId: string }; response: FileReviewRecord | null }
  'fs:resolve-review': { request: { reviewId: string; resolution: FileReviewResolution }; response: FileReviewRecord }

  'timeline:list': { request: { sessionId: string }; response: ContextTimelineEntry[] }
  'timeline:restore-change': { request: { reviewId: string }; response: ContextTimelineRestoreResult }

  'project:choose-directory': { request: { defaultPath?: string } | undefined; response: string | null }
  'project:create': { request: ProjectCreationRequest; response: ProjectCreationResult }
  'project:recent': { request: Record<string, never> | undefined; response: ProjectHistoryEntry[] }
  'project:last': { request: Record<string, never> | undefined; response: ProjectHistoryEntry | null }

  'preview:open-external': { request: { url: string }; response: void }

  'marketplace:catalog': {
    request: Record<string, never> | undefined
    response: MarketplaceCatalogReadResult
  }
  'marketplace:favorites': {
    request: Record<string, never> | undefined
    response: MarketplaceFavoriteCollection
  }
  'marketplace:set-favorite': {
    request: MarketplaceFavoriteSetRequest
    response: MarketplaceFavoriteCollection
  }
  'marketplace:installations': {
    request: Record<string, never> | undefined
    response: MarketplaceInstallationCollection
  }
  'marketplace:install': {
    request: MarketplaceInstallRequest
    response: MarketplaceInstallResult
  }
  'marketplace:uninstall': {
    request: MarketplaceUninstallRequest
    response: MarketplaceInstallationCollection
  }
  'marketplace:activate': {
    request: MarketplaceActivationRequest
    response: MarketplaceActivationRecord
  }
  'marketplace:deactivate': {
    request: MarketplaceDeactivationRequest
    response: MarketplaceActiveResourceCollection
  }
  'marketplace:active-resources': {
    request: Record<string, never> | undefined
    response: MarketplaceActiveResourceCollection
  }
  'marketplace:invoke-plugin': {
    request: MarketplacePluginInvocationRequest
    response: MarketplacePluginInvocationResult
  }
  'marketplace:update': { request: MarketplaceUpdateDeliveryRequest; response: MarketplaceUpdateDeliveryResult }
  'marketplace:updates': { request: Record<string, never> | undefined; response: MarketplaceUpdateCollection }
  'marketplace:rollback-update': { request: MarketplaceUpdateActionRequest; response: MarketplaceUpdateRecord }
  'marketplace:finalize-update': { request: MarketplaceUpdateActionRequest; response: MarketplaceUpdateRecord }
  'marketplace:qualification': { request: Record<string, never> | undefined; response: MarketplacePublicationQualification }

  'settings:application-preferences': {
    request: Record<string, never> | undefined
    response: ApplicationPreferences
  }
  'settings:update-application-preferences': {
    request: ApplicationPreferencesUpdateRequest
    response: ApplicationPreferences
  }
  'settings:list-feedback': {
    request: Record<string, never> | undefined
    response: FeedbackRecord[]
  }
  'settings:choose-feedback-attachments': {
    request: Record<string, never> | undefined
    response: FeedbackAttachment[]
  }
  'settings:discard-feedback-attachment': {
    request: FeedbackAttachmentDiscardRequest
    response: void
  }
  'settings:submit-feedback': {
    request: FeedbackSubmissionRequest
    response: FeedbackRecord
  }

  'update:state': { request: Record<string, never> | undefined; response: ApplicationUpdateState }
  'update:check': { request: Record<string, never> | undefined; response: ApplicationUpdateState }
  'update:download': { request: Record<string, never> | undefined; response: ApplicationUpdateState }
  'update:install': { request: Record<string, never> | undefined; response: ApplicationUpdateState }

  'plan:list': { request: { sessionId: string }; response: PlanDocument[] }
  'plan:list-all': { request: Record<string, never> | undefined; response: PlanDocument[] }
  'plan:generate': { request: { sessionId: string; source: string }; response: PlanDocument }
  'plan:update': { request: { id: string; draft: PlanDraftInput }; response: PlanDocument }
  'plan:approve': { request: { executionMode: PlanExecutionMode; id: string; selectedStepIds?: string[] }; response: PlanDocument }
  'plan:execute': { request: { id: string }; response: PlanDocument }
  'plan:execute-next': { request: { id: string }; response: PlanDocument }
  'plan:cancel': { request: { id: string }; response: PlanDocument }

  'provider:list': { request: Record<string, never> | undefined; response: ProviderConfig[] }
  'provider:probe-models': { request: ProviderModelProbeRequest; response: ProviderModelProbeResult }
  'axis:qualify-reviewer': { request: AxisReviewerQualificationRequest; response: AxisReviewerQualificationEvidence }
  'axis:get-reviewer-routing': { request: Record<string, never> | undefined; response: AxisReviewerRoutingConfig }
  'axis:update-reviewer-routing': { request: AxisReviewerRoutingUpdate; response: AxisReviewerRoutingConfig }
  'provider:save': { request: ProviderConfigInput; response: ProviderConfig }
  'provider:set-active': { request: { id: string }; response: ProviderConfig }
  'provider:test': { request: { id: string }; response: ProviderConnectionResult }
  'provider:delete': { request: { id: string }; response: void }

  'term:create': { request: { cwd: string; sessionId: string; rows?: number; cols?: number }; response: string }
  'term:write': { request: { id: string; data: string }; response: void }
  'term:resize': { request: { id: string; cols: number; rows: number }; response: void }
  'term:destroy': { request: { id: string }; response: void }
  'session:list': { request: Record<string, never> | undefined; response: SessionRecord[] }
  'session:get': { request: { id: string }; response: SessionRecord | null }
  'session:create': { request: { projectPath: string; title?: string }; response: SessionRecord }
  'session:open-project': { request: { projectPath: string; title?: string }; response: SessionRecord }
  'session:delete': { request: { id: string }; response: void }
  'session:soft-delete': { request: { id: string }; response: SessionRecord }
  'session:undo-delete': { request: { id: string }; response: SessionRecord }
  'session:set-pinned': { request: { id: string; isPinned: boolean }; response: SessionRecord }
  'session:update': { request: { id: string; patch: SessionMetadataPatch }; response: SessionRecord }
  'session:search': { request: { query: string }; response: SessionRecord[] }
  'session:fork': { request: { id: string }; response: SessionRecord }
  'session:list-groups': { request: Record<string, never> | undefined; response: SessionGroupRecord[] }
  'session:create-group': { request: { name: string; parentId?: string | null }; response: SessionGroupRecord }
  'session:rename-group': { request: { id: string; name: string }; response: SessionGroupRecord }
  'session:delete-group': { request: { id: string }; response: void }
  'session:export': { request: { id: string; format: 'markdown' | 'json' }; response: string }
}

export interface PivotPreloadApi {
  invoke<K extends keyof IPCContract>(
    channel: K,
    request: IPCContract[K]['request'],
  ): Promise<IPCContract[K]['response']>
  onSignal<K extends keyof SignalMap>(
    signal: K,
    handler: (payload: SignalMap[K]) => void,
  ): () => void
}
