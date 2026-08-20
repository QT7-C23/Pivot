import type { IPCContract } from './types/ipc'
import { AGENT_CONTEXT_MAX_FILES } from './constants'
import { isAllowedPreviewUrl } from './preview-url'
import { AxisDryRunApprovalRequestSchema, AxisRunStateTransitionRequestSchema, AxisShadowPlanRequestSchema } from './axis-engine-contracts'
import { AxisGuardedSafeWriteSubmissionSchema } from './axis-guarded-safe-write-contracts'
import { AxisSafeWriteProposalRequestSchema } from './axis-safe-write-proposal-contracts'
import { ApplicationPreferencesUpdateRequestSchema } from './application-preferences'
import { FeedbackAttachmentDiscardRequestSchema, FeedbackSubmissionRequestSchema } from './feedback'
import { MarketplaceFavoriteSetRequestSchema } from './marketplace-contracts'
import { MarketplaceInstallRequestSchema, MarketplaceUninstallRequestSchema, MarketplaceUpdateDeliveryRequestSchema } from './marketplace-delivery-contracts'
import { MarketplaceUpdateActionRequestSchema } from './marketplace-update-contracts'
import { MarketplaceActivationRequestSchema, MarketplaceDeactivationRequestSchema } from './marketplace-activation-contracts'
import { MarketplacePluginInvocationRequestSchema } from './marketplace-resource-contracts'
import { AttentionLifecycleRequestSchema, AttentionObservationSchema } from './attention'
import { ProjectCreationRequestSchema } from './project-creation'
import { AxisSemanticReviewTelemetryQuerySchema } from './axis-semantic-review-telemetry-contracts'
import { ProviderModelProbeRequestSchema } from './provider-model-probe-contracts'
import { AxisReviewerQualificationRequestSchema, AxisReviewerRoutingUpdateSchema } from './axis-reviewer-qualification-contracts'

type Channel = keyof IPCContract
type UnknownRecord = Record<string, unknown>

const PROFILE_IDS = ['local', 'codex', 'claude', 'custom'] as const
const MAINTENANCE_ACTIONS = ['version', 'update'] as const
const ALLOWED_FIELDS = {
  'attention:list': [],
  'attention:observe': ['contextLabel', 'detail', 'kind', 'severity', 'sourceId', 'title'],
  'attention:resolve': ['attentionId', 'expectedRevision'],
  'attention:reopen': ['attentionId', 'expectedRevision'],
  'chat:send': ['context', 'sessionId', 'text'],
  'chat:abort': ['sessionId'],
  'chat:list': ['sessionId'],
  'chat:permission': ['behavior', 'requestId'],
  'agent:info': [],
  'agent:profiles': [],
  'agent:select-profile': ['profileId'],
  'agent:configure-custom-profile': ['adapterArgs', 'adapterCommand', 'updateCommand', 'versionCommand'],
  'agent:run-cli-maintenance': ['action', 'profileId'],
  'axis:shadow-state': [],
  'axis:set-shadow-enabled': ['enabled'],
  'axis:plan-shadow': ['budget', 'objective', 'sessionId'],
  'axis:list-traces': ['sessionId'],
  'axis:list-shadow-runs': ['sessionId'],
  'axis:list-run-states': ['sessionId'],
  'axis:cancel-run': ['expectedRevision', 'runId', 'sessionId'],
  'axis:restart-run': ['expectedRevision', 'runId', 'sessionId'],
  'axis:dry-run-state': [],
  'axis:set-dry-run-enabled': ['enabled'],
  'axis:execute-dry-run': ['approvedTaskIds', 'expectedRevision', 'runId', 'sessionId'],
  'axis:guarded-safe-write-state': [],
  'axis:propose-guarded-safe-write': ['expectedRevision', 'runId', 'sessionId', 'taskId'],
  'axis:execute-guarded-safe-write': [
    'expectedRevision',
    'reviewedProposalReceipt',
    'runId',
    'sessionId',
    'taskId',
    'writes',
  ],
  'axis:list-semantic-review-telemetry': ['limit', 'sessionId'],
  'fs:tree': ['sessionId'],
  'fs:children': ['dirPath', 'sessionId'],
  'fs:read': ['filePath', 'sessionId'],
  'fs:search': ['limit', 'query', 'sessionId'],
  'fs:watch': ['sessionId'],
  'fs:create-file': ['name', 'parentPath', 'sessionId'],
  'fs:create-directory': ['name', 'parentPath', 'sessionId'],
  'fs:reveal': ['filePath', 'sessionId'],
  'fs:checkpoint': ['filePath', 'sessionId'],
  'fs:list-checkpoints': ['sessionId'],
  'fs:restore-checkpoint': ['checkpointId'],
  'fs:list-reviews': ['includeResolved', 'sessionId'],
  'fs:get-review': ['reviewId'],
  'fs:resolve-review': ['resolution', 'reviewId'],
  'timeline:list': ['sessionId'],
  'timeline:restore-change': ['reviewId'],
  'project:choose-directory': ['defaultPath'],
  'project:create': ['description', 'initializeGit', 'parentPath', 'projectName', 'remoteOriginUrl', 'schemaVersion'],
  'project:recent': [],
  'project:last': [],
  'preview:open-external': ['url'],
  'marketplace:catalog': [],
  'marketplace:favorites': [],
  'marketplace:set-favorite': ['expectedRevision', 'favorite', 'kind', 'resourceId', 'sourceId'],
  'marketplace:installations': [],
  'marketplace:install': ['approvedCapabilities', 'expectedCatalogRevision', 'kind', 'resourceId', 'sourceId'],
  'marketplace:uninstall': ['expectedRevision', 'identity'],
  'marketplace:activate': ['expectedInstallationRevision', 'identity'],
  'marketplace:deactivate': ['expectedActivationRevision', 'identity'],
  'marketplace:active-resources': [],
  'marketplace:invoke-plugin': ['registrationId'],
  'marketplace:update': ['approvedCapabilities', 'currentIdentity', 'expectedCatalogRevision', 'expectedCurrentRevision', 'kind', 'resourceId', 'sourceId'],
  'marketplace:updates': [],
  'marketplace:rollback-update': ['expectedRevision', 'updateId'],
  'marketplace:finalize-update': ['expectedRevision', 'updateId'],
  'marketplace:qualification': [],
  'settings:application-preferences': [],
  'settings:update-application-preferences': ['expectedRevision', 'patch'],
  'settings:list-feedback': [],
  'settings:choose-feedback-attachments': [],
  'settings:discard-feedback-attachment': ['attachmentId'],
  'settings:submit-feedback': ['attachmentIds', 'description', 'priority', 'submissionId', 'title', 'type'],
  'update:state': [],
  'update:check': [],
  'update:download': [],
  'update:install': [],
  'plan:list': ['sessionId'],
  'plan:list-all': [],
  'plan:generate': ['sessionId', 'source'],
  'plan:update': ['draft', 'id'],
  'plan:approve': ['executionMode', 'id', 'selectedStepIds'],
  'plan:execute': ['id'],
  'plan:execute-next': ['id'],
  'plan:cancel': ['id'],
  'provider:list': [],
  'provider:probe-models': ['forceRefresh', 'providerId'],
  'axis:qualify-reviewer': ['modelId', 'providerId'],
  'axis:get-reviewer-routing': [],
  'axis:update-reviewer-routing': ['expectedRevision', 'routing'],
  'provider:save': ['apiKey', 'baseUrl', 'id', 'kind', 'label', 'model'],
  'provider:set-active': ['id'],
  'provider:test': ['id'],
  'provider:delete': ['id'],
  'term:create': ['cols', 'cwd', 'rows', 'sessionId'],
  'term:write': ['data', 'id'],
  'term:resize': ['cols', 'id', 'rows'],
  'term:destroy': ['id'],
  'session:list': [],
  'session:get': ['id'],
  'session:create': ['projectPath', 'title'],
  'session:open-project': ['projectPath', 'title'],
  'session:delete': ['id'],
  'session:soft-delete': ['id'],
  'session:undo-delete': ['id'],
  'session:set-pinned': ['id', 'isPinned'],
  'session:update': ['id', 'patch'],
  'session:search': ['query'],
  'session:fork': ['id'],
  'session:list-groups': [],
  'session:create-group': ['name', 'parentId'],
  'session:rename-group': ['id', 'name'],
  'session:delete-group': ['id'],
  'session:export': ['format', 'id'],
} as const satisfies Record<Channel, readonly string[]>

export function validateIpcRequest<K extends Channel>(
  channel: K,
  request: unknown,
): IPCContract[K]['request'] {
  if (request && typeof request === 'object' && !Array.isArray(request)) {
    assertKnownFields(channel, request as UnknownRecord, ALLOWED_FIELDS[channel])
  }
  switch (channel) {
    case 'attention:list':
      requireEmptyRequest(channel, request)
      break
    case 'attention:observe': {
      const parsed = AttentionObservationSchema.safeParse(request)
      if (!parsed.success) {
        throw invalidRequest(channel, `invalid Attention observation: ${parsed.error.issues[0]?.message ?? 'invalid request'}`)
      }
      break
    }
    case 'attention:resolve':
    case 'attention:reopen': {
      const parsed = AttentionLifecycleRequestSchema.safeParse(request)
      if (!parsed.success) {
        throw invalidRequest(channel, `invalid Attention lifecycle request: ${parsed.error.issues[0]?.message ?? 'invalid request'}`)
      }
      break
    }
    case 'chat:send': {
      const value = requireRecord(channel, request)
      requireNonEmptyString(channel, value, 'sessionId')
      requireNonEmptyString(channel, value, 'text')
      if (value['context'] !== undefined) {
        const context = requireRecord(`${channel}.context`, value['context'])
        assertKnownFields(`${channel}.context`, context, ['activeFilePath', 'interactionMode', 'reasoningEffort', 'referencedFilePaths'])
        optionalNonEmptyString(channel, context, 'activeFilePath')
        if (context['referencedFilePaths'] !== undefined) {
          const referencedFilePaths = requireStringArray(channel, context, 'referencedFilePaths')
          if (referencedFilePaths.some((filePath) => !filePath.trim())) {
            throw invalidRequest(channel, 'expected "referencedFilePaths" entries to be non-empty')
          }
          if (referencedFilePaths.length > AGENT_CONTEXT_MAX_FILES) {
            throw invalidRequest(channel, `expected at most ${AGENT_CONTEXT_MAX_FILES} referenced file paths`)
          }
        }
        if (context['interactionMode'] !== undefined) {
          requireEnum(channel, context, 'interactionMode', ['chat', 'agent', 'terminal'] as const)
        }
        if (context['reasoningEffort'] !== undefined) {
          const effort = requirePositiveInteger(channel, context, 'reasoningEffort')
          if (effort > 5) throw invalidRequest(channel, 'expected "reasoningEffort" to be between 1 and 5')
        }
      }
      break
    }
    case 'chat:abort':
    case 'chat:list':
      requireNonEmptyString(channel, requireRecord(channel, request), 'sessionId')
      break
    case 'chat:permission': {
      const value = requireRecord(channel, request)
      requireNonEmptyString(channel, value, 'requestId')
      requireEnum(channel, value, 'behavior', ['allow', 'allow_session', 'deny'] as const)
      break
    }
    case 'agent:info':
    case 'agent:profiles':
    case 'axis:shadow-state':
    case 'axis:dry-run-state':
    case 'axis:guarded-safe-write-state':
    case 'project:recent':
    case 'project:last':
    case 'marketplace:catalog':
    case 'marketplace:favorites':
    case 'marketplace:active-resources':
    case 'marketplace:updates':
    case 'marketplace:qualification':
    case 'session:list':
    case 'session:list-groups':
    case 'provider:list':
    case 'axis:get-reviewer-routing':
    case 'update:state':
    case 'update:check':
    case 'update:download':
    case 'update:install':
    case 'plan:list-all':
    case 'settings:application-preferences':
    case 'settings:list-feedback':
    case 'settings:choose-feedback-attachments':
      requireEmptyRequest(channel, request)
      break
    case 'marketplace:set-favorite': {
      const parsed = MarketplaceFavoriteSetRequestSchema.safeParse(request)
      if (!parsed.success) {
        throw invalidRequest(channel, `invalid Marketplace favorite: ${parsed.error.issues[0]?.message ?? 'invalid request'}`)
      }
      return parsed.data as IPCContract[K]['request']
    }
    case 'marketplace:installations':
      requireEmptyRequest(channel, request)
      break
    case 'marketplace:install': {
      const parsed = MarketplaceInstallRequestSchema.safeParse(request)
      if (!parsed.success) {
        throw invalidRequest(channel, `invalid Marketplace install request: ${parsed.error.issues[0]?.message ?? 'invalid request'}`)
      }
      return parsed.data as IPCContract[K]['request']
    }
    case 'marketplace:uninstall': {
      const parsed = MarketplaceUninstallRequestSchema.safeParse(request)
      if (!parsed.success) {
        throw invalidRequest(channel, `invalid Marketplace uninstall request: ${parsed.error.issues[0]?.message ?? 'invalid request'}`)
      }
      return parsed.data as IPCContract[K]['request']
    }
    case 'marketplace:activate': {
      const parsed = MarketplaceActivationRequestSchema.safeParse(request)
      if (!parsed.success) throw invalidRequest(channel, `invalid Marketplace activation: ${parsed.error.issues[0]?.message ?? 'invalid request'}`)
      return parsed.data as IPCContract[K]['request']
    }
    case 'marketplace:deactivate': {
      const parsed = MarketplaceDeactivationRequestSchema.safeParse(request)
      if (!parsed.success) throw invalidRequest(channel, `invalid Marketplace deactivation: ${parsed.error.issues[0]?.message ?? 'invalid request'}`)
      return parsed.data as IPCContract[K]['request']
    }
    case 'marketplace:invoke-plugin': {
      const parsed = MarketplacePluginInvocationRequestSchema.safeParse(request)
      if (!parsed.success) throw invalidRequest(channel, `invalid Marketplace plugin invocation: ${parsed.error.issues[0]?.message ?? 'invalid request'}`)
      return parsed.data as IPCContract[K]['request']
    }
    case 'marketplace:update': {
      const parsed = MarketplaceUpdateDeliveryRequestSchema.safeParse(request)
      if (!parsed.success) throw invalidRequest(channel, `invalid Marketplace update: ${parsed.error.issues[0]?.message ?? 'invalid request'}`)
      return parsed.data as IPCContract[K]['request']
    }
    case 'marketplace:rollback-update':
    case 'marketplace:finalize-update': {
      const parsed = MarketplaceUpdateActionRequestSchema.safeParse(request)
      if (!parsed.success) throw invalidRequest(channel, `invalid Marketplace update action: ${parsed.error.issues[0]?.message ?? 'invalid request'}`)
      return parsed.data as IPCContract[K]['request']
    }
    case 'axis:qualify-reviewer': {
      const parsed = AxisReviewerQualificationRequestSchema.safeParse(request)
      if (!parsed.success) throw invalidRequest(channel, 'invalid Reviewer qualification request')
      return parsed.data as IPCContract[K]['request']
    }
    case 'axis:update-reviewer-routing': {
      const parsed = AxisReviewerRoutingUpdateSchema.safeParse(request)
      if (!parsed.success) throw invalidRequest(channel, 'invalid Reviewer routing update')
      return parsed.data as IPCContract[K]['request']
    }
    case 'provider:probe-models': {
      const parsed = ProviderModelProbeRequestSchema.safeParse(request)
      if (!parsed.success) throw invalidRequest(channel, `invalid Provider model probe: ${parsed.error.issues[0]?.message ?? 'invalid request'}`)
      return parsed.data as IPCContract[K]['request']
    }
    case 'settings:update-application-preferences': {
      const parsed = ApplicationPreferencesUpdateRequestSchema.safeParse(request)
      if (!parsed.success) {
        throw invalidRequest(
          channel,
          `invalid application preferences: ${parsed.error.issues[0]?.message ?? 'invalid request'}`,
        )
      }
      break
    }
    case 'settings:submit-feedback': {
      const parsed = FeedbackSubmissionRequestSchema.safeParse(request)
      if (!parsed.success) {
        throw invalidRequest(
          channel,
          `invalid feedback: ${parsed.error.issues[0]?.message ?? 'invalid request'}`,
        )
      }
      break
    }
    case 'settings:discard-feedback-attachment': {
      const parsed = FeedbackAttachmentDiscardRequestSchema.safeParse(request)
      if (!parsed.success) {
        throw invalidRequest(
          channel,
          `invalid feedback attachment discard: ${parsed.error.issues[0]?.message ?? 'invalid request'}`,
        )
      }
      break
    }
    case 'axis:set-shadow-enabled': {
      const value = requireRecord(channel, request)
      if (typeof value['enabled'] !== 'boolean') throw invalidRequest(channel, 'expected "enabled" to be a boolean')
      break
    }
    case 'axis:set-dry-run-enabled': {
      const value = requireRecord(channel, request)
      if (typeof value['enabled'] !== 'boolean') throw invalidRequest(channel, 'expected "enabled" to be a boolean')
      break
    }
    case 'axis:list-traces':
    case 'axis:list-shadow-runs':
    case 'axis:list-run-states':
      requireNonEmptyString(channel, requireRecord(channel, request), 'sessionId')
      break
    case 'axis:list-semantic-review-telemetry': {
      const parsed = AxisSemanticReviewTelemetryQuerySchema.safeParse(request)
      if (!parsed.success) throw invalidRequest(channel, parsed.error.issues[0]?.message ?? 'invalid semantic review telemetry query')
      break
    }
    case 'axis:cancel-run':
    case 'axis:restart-run': {
      const parsed = AxisRunStateTransitionRequestSchema.safeParse(request)
      if (!parsed.success) throw invalidRequest(channel, parsed.error.issues[0]?.message ?? 'invalid Axis run-state request')
      break
    }
    case 'axis:execute-dry-run': {
      const parsed = AxisDryRunApprovalRequestSchema.safeParse(request)
      if (!parsed.success) throw invalidRequest(channel, parsed.error.issues[0]?.message ?? 'invalid Axis dry-run approval')
      break
    }
    case 'axis:propose-guarded-safe-write': {
      const parsed = AxisSafeWriteProposalRequestSchema.safeParse(request)
      if (!parsed.success) {
        throw invalidRequest(
          channel,
          parsed.error.issues[0]?.message ?? 'invalid Axis safe-write proposal request',
        )
      }
      break
    }
    case 'axis:execute-guarded-safe-write': {
      const parsed = AxisGuardedSafeWriteSubmissionSchema.safeParse(request)
      if (!parsed.success) {
        throw invalidRequest(
          channel,
          parsed.error.issues[0]?.message ?? 'invalid Axis guarded safe-write submission',
        )
      }
      break
    }
    case 'axis:plan-shadow': {
      const parsed = AxisShadowPlanRequestSchema.safeParse(request)
      if (!parsed.success) throw invalidRequest(channel, parsed.error.issues[0]?.message ?? 'invalid Axis Shadow request')
      break
    }
    case 'agent:select-profile':
      requireEnum(channel, requireRecord(channel, request), 'profileId', PROFILE_IDS)
      break
    case 'agent:configure-custom-profile': {
      const value = requireRecord(channel, request)
      requireStringArray(channel, value, 'adapterArgs')
      optionalNonEmptyString(channel, value, 'adapterCommand')
      validateCommandSpec(channel, value['updateCommand'])
      validateCommandSpec(channel, value['versionCommand'])
      break
    }
    case 'agent:run-cli-maintenance': {
      const value = requireRecord(channel, request)
      requireEnum(channel, value, 'action', MAINTENANCE_ACTIONS)
      requireEnum(channel, value, 'profileId', PROFILE_IDS)
      break
    }

    case 'fs:tree':
    case 'fs:watch':
      requireNonEmptyString(channel, requireRecord(channel, request), 'sessionId')
      break
    case 'fs:children': {
      const value = requireRecord(channel, request)
      requireNonEmptyString(channel, value, 'dirPath')
      requireNonEmptyString(channel, value, 'sessionId')
      break
    }
    case 'fs:read': {
      const value = requireRecord(channel, request)
      requireNonEmptyString(channel, value, 'filePath')
      requireNonEmptyString(channel, value, 'sessionId')
      break
    }
    case 'fs:create-file':
    case 'fs:create-directory': {
      const value = requireRecord(channel, request)
      requireNonEmptyString(channel, value, 'sessionId')
      requireNonEmptyString(channel, value, 'parentPath')
      const name = requireNonEmptyString(channel, value, 'name')
      if (name === '.' || name === '..' || name.includes('/') || name.includes('\\')) {
        throw invalidRequest(channel, 'expected "name" to be a single path segment')
      }
      break
    }
    case 'fs:reveal': {
      const value = requireRecord(channel, request)
      requireNonEmptyString(channel, value, 'sessionId')
      requireNonEmptyString(channel, value, 'filePath')
      break
    }
    case 'fs:search': {
      const value = requireRecord(channel, request)
      requireNonEmptyString(channel, value, 'query')
      requireNonEmptyString(channel, value, 'sessionId')
      optionalPositiveInteger(channel, value, 'limit')
      break
    }
    case 'fs:checkpoint': {
      const value = requireRecord(channel, request)
      requireNonEmptyString(channel, value, 'sessionId')
      requireNonEmptyString(channel, value, 'filePath')
      break
    }
    case 'fs:list-checkpoints':
      requireNonEmptyString(channel, requireRecord(channel, request), 'sessionId')
      break
    case 'fs:restore-checkpoint':
      requireNonEmptyString(channel, requireRecord(channel, request), 'checkpointId')
      break
    case 'fs:list-reviews': {
      const value = requireRecord(channel, request)
      requireNonEmptyString(channel, value, 'sessionId')
      optionalBoolean(channel, value, 'includeResolved')
      break
    }
    case 'fs:get-review':
      requireNonEmptyString(channel, requireRecord(channel, request), 'reviewId')
      break
    case 'fs:resolve-review': {
      const value = requireRecord(channel, request)
      requireNonEmptyString(channel, value, 'reviewId')
      const resolution = requireRecord(`${channel}.resolution`, value['resolution'])
      assertKnownFields(`${channel}.resolution`, resolution, ['decision', 'hunkIndex'])
      requireEnum(channel, resolution, 'decision', ['accept', 'reject', 'reset'] as const)
      optionalNonNegativeInteger(channel, resolution, 'hunkIndex')
      break
    }
    case 'timeline:list':
      requireNonEmptyString(channel, requireRecord(channel, request), 'sessionId')
      break
    case 'timeline:restore-change':
      requireNonEmptyString(channel, requireRecord(channel, request), 'reviewId')
      break

    case 'project:choose-directory': {
      if (request !== undefined) {
        optionalNonEmptyString(channel, requireRecord(channel, request), 'defaultPath')
      }
      break
    }
    case 'project:create': {
      const parsed = ProjectCreationRequestSchema.safeParse(request)
      if (!parsed.success) {
        throw invalidRequest(
          channel,
          `invalid project creation request: ${parsed.error.issues[0]?.message ?? 'invalid request'}`,
        )
      }
      break
    }

    case 'preview:open-external': {
      const value = requireRecord(channel, request)
      const url = requireNonEmptyString(channel, value, 'url')
      if (!isAllowedPreviewUrl(url)) throw invalidRequest(channel, 'expected "url" to be an allowed Preview URL')
      break
    }

    case 'plan:list':
      requireNonEmptyString(channel, requireRecord(channel, request), 'sessionId')
      break
    case 'plan:generate': {
      const value = requireRecord(channel, request)
      requireNonEmptyString(channel, value, 'sessionId')
      requireNonEmptyString(channel, value, 'source')
      break
    }
    case 'plan:update': {
      const value = requireRecord(channel, request)
      requireNonEmptyString(channel, value, 'id')
      validatePlanDraft(channel, value['draft'])
      break
    }
    case 'plan:approve': {
      const value = requireRecord(channel, request)
      requireNonEmptyString(channel, value, 'id')
      requireEnum(channel, value, 'executionMode', ['auto', 'step', 'selective'] as const)
      optionalStringArray(channel, value, 'selectedStepIds')
      break
    }
    case 'plan:execute':
    case 'plan:execute-next':
    case 'plan:cancel':
      requireNonEmptyString(channel, requireRecord(channel, request), 'id')
      break
    case 'provider:save': {
      const value = requireRecord(channel, request)
      requireNonEmptyString(channel, value, 'id')
      requireEnum(channel, value, 'kind', ['anthropic', 'openai', 'deepseek', 'glm', 'qwen', 'kimi', 'custom'] as const)
      requireNonEmptyString(channel, value, 'label')
      requireNonEmptyString(channel, value, 'baseUrl')
      requireNonEmptyString(channel, value, 'model')
      optionalNonEmptyString(channel, value, 'apiKey')
      break
    }
    case 'provider:set-active':
    case 'provider:test':
    case 'provider:delete':
      requireNonEmptyString(channel, requireRecord(channel, request), 'id')
      break

    case 'term:create': {
      const value = requireRecord(channel, request)
      requireNonEmptyString(channel, value, 'cwd')
      requireNonEmptyString(channel, value, 'sessionId')
      optionalPositiveInteger(channel, value, 'cols')
      optionalPositiveInteger(channel, value, 'rows')
      break
    }
    case 'term:write': {
      const value = requireRecord(channel, request)
      requireNonEmptyString(channel, value, 'id')
      requireString(channel, value, 'data')
      break
    }
    case 'term:resize': {
      const value = requireRecord(channel, request)
      requireNonEmptyString(channel, value, 'id')
      requirePositiveInteger(channel, value, 'cols')
      requirePositiveInteger(channel, value, 'rows')
      break
    }
    case 'term:destroy':
      requireNonEmptyString(channel, requireRecord(channel, request), 'id')
      break
    case 'session:get':
    case 'session:delete':
    case 'session:soft-delete':
    case 'session:undo-delete':
    case 'session:fork':
    case 'session:delete-group':
      requireNonEmptyString(channel, requireRecord(channel, request), 'id')
      break
    case 'session:set-pinned': {
      const value = requireRecord(channel, request)
      requireNonEmptyString(channel, value, 'id')
      if (typeof value['isPinned'] !== 'boolean') {
        throw invalidRequest(channel, 'expected "isPinned" to be a boolean')
      }
      break
    }
    case 'session:update': {
      const value = requireRecord(channel, request)
      requireNonEmptyString(channel, value, 'id')
      const patch = requireRecord(`${channel}.patch`, value['patch'])
      assertKnownFields(`${channel}.patch`, patch, ['groupId', 'isFavorite', 'isUnread', 'status', 'tags', 'title'])
      optionalNullableNonEmptyString(channel, patch, 'groupId')
      optionalBoolean(channel, patch, 'isFavorite')
      optionalBoolean(channel, patch, 'isUnread')
      if (patch['status'] !== undefined) requireEnum(channel, patch, 'status', ['active', 'idle', 'archived'] as const)
      if (patch['tags'] !== undefined) {
        const tags = requireStringArray(channel, patch, 'tags')
        if (tags.some((tag) => !tag.trim())) throw invalidRequest(channel, 'expected "tags" entries to be non-empty')
      }
      optionalNonEmptyString(channel, patch, 'title')
      break
    }
    case 'session:search':
      requireNonEmptyString(channel, requireRecord(channel, request), 'query')
      break
    case 'session:create-group': {
      const value = requireRecord(channel, request)
      requireNonEmptyString(channel, value, 'name')
      optionalNullableNonEmptyString(channel, value, 'parentId')
      break
    }
    case 'session:rename-group': {
      const value = requireRecord(channel, request)
      requireNonEmptyString(channel, value, 'id')
      requireNonEmptyString(channel, value, 'name')
      break
    }
    case 'session:create':
    case 'session:open-project': {
      const value = requireRecord(channel, request)
      requireNonEmptyString(channel, value, 'projectPath')
      optionalNonEmptyString(channel, value, 'title')
      break
    }
    case 'session:export': {
      const value = requireRecord(channel, request)
      requireNonEmptyString(channel, value, 'id')
      requireEnum(channel, value, 'format', ['markdown', 'json'] as const)
      break
    }
    default:
      return assertNever(channel)
  }

  return request as IPCContract[K]['request']
}

function requireRecord(channel: string, value: unknown): UnknownRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw invalidRequest(channel, 'expected an object')
  }
  return value as UnknownRecord
}

function requireEmptyRequest(channel: string, value: unknown): void {
  if (value === undefined) return
  const record = requireRecord(channel, value)
  if (Object.keys(record).length > 0) {
    throw invalidRequest(channel, 'expected no request fields')
  }
}

function requireString(channel: string, value: UnknownRecord, field: string): string {
  const candidate = value[field]
  if (typeof candidate !== 'string') {
    throw invalidRequest(channel, `expected "${field}" to be a string`)
  }
  return candidate
}

function requireNonEmptyString(channel: string, value: UnknownRecord, field: string): string {
  const candidate = requireString(channel, value, field)
  if (!candidate.trim()) {
    throw invalidRequest(channel, `expected "${field}" to be non-empty`)
  }
  return candidate
}

function optionalNonEmptyString(channel: string, value: UnknownRecord, field: string): void {
  if (value[field] !== undefined) requireNonEmptyString(channel, value, field)
}

function optionalNullableNonEmptyString(channel: string, value: UnknownRecord, field: string): void {
  if (value[field] !== undefined && value[field] !== null) requireNonEmptyString(channel, value, field)
}

function requirePositiveInteger(channel: string, value: UnknownRecord, field: string): number {
  const candidate = value[field]
  if (typeof candidate !== 'number' || !Number.isInteger(candidate) || candidate < 1) {
    throw invalidRequest(channel, `expected "${field}" to be a positive integer`)
  }
  return candidate
}

function optionalPositiveInteger(channel: string, value: UnknownRecord, field: string): void {
  if (value[field] !== undefined) requirePositiveInteger(channel, value, field)
}

function optionalNonNegativeInteger(channel: string, value: UnknownRecord, field: string): void {
  if (value[field] === undefined) return
  const candidate = value[field]
  if (typeof candidate !== 'number' || !Number.isInteger(candidate) || candidate < 0) {
    throw invalidRequest(channel, `expected "${field}" to be a non-negative integer`)
  }
}

function optionalBoolean(channel: string, value: UnknownRecord, field: string): void {
  if (value[field] !== undefined && typeof value[field] !== 'boolean') {
    throw invalidRequest(channel, `expected "${field}" to be a boolean`)
  }
}

function requireStringArray(channel: string, value: UnknownRecord, field: string): string[] {
  const candidate = value[field]
  if (!Array.isArray(candidate) || candidate.some((item) => typeof item !== 'string')) {
    throw invalidRequest(channel, `expected "${field}" to be a string array`)
  }
  return candidate
}

function optionalStringArray(channel: string, value: UnknownRecord, field: string): void {
  if (value[field] !== undefined) requireStringArray(channel, value, field)
}

function requireEnum<const T extends readonly string[]>(
  channel: string,
  value: UnknownRecord,
  field: string,
  allowed: T,
): T[number] {
  const candidate = value[field]
  if (typeof candidate !== 'string' || !(allowed as readonly string[]).includes(candidate)) {
    throw invalidRequest(channel, `expected "${field}" to be one of: ${allowed.join(', ')}`)
  }
  return candidate
}

function validateCommandSpec(channel: string, value: unknown): void {
  if (value === undefined) return
  const command = requireRecord(`${channel}.command`, value)
  assertKnownFields(`${channel}.command`, command, ['args', 'command'])
  requireNonEmptyString(channel, command, 'command')
  requireStringArray(channel, command, 'args')
}

function assertKnownFields(channel: string, value: UnknownRecord, allowed: readonly string[]): void {
  const unknown = Object.keys(value).filter((field) => !allowed.includes(field))
  if (unknown.length > 0) {
    throw invalidRequest(channel, `unknown field(s): ${unknown.join(', ')}`)
  }
}

function validatePlanDraft(channel: string, candidate: unknown): void {
  const draft = requireRecord(`${channel}.draft`, candidate)
  assertKnownFields(`${channel}.draft`, draft, ['source', 'steps', 'title'])
  requireNonEmptyString(channel, draft, 'source')
  requireNonEmptyString(channel, draft, 'title')
  if (!Array.isArray(draft['steps']) || draft['steps'].length === 0) throw invalidRequest(channel, 'expected "steps" to be a non-empty array')
  for (const candidateStep of draft['steps']) {
    const step = requireRecord(`${channel}.draft.steps`, candidateStep)
    assertKnownFields(`${channel}.draft.steps`, step, ['description', 'targets', 'title'])
    requireString(channel, step, 'description')
    requireNonEmptyString(channel, step, 'title')
    requireStringArray(channel, step, 'targets')
  }
}

function invalidRequest(channel: string, reason: string): Error {
  return new Error(`Invalid IPC request for ${channel}: ${reason}`)
}

function assertNever(value: never): never {
  throw new Error(`Unvalidated IPC channel: ${String(value)}`)
}
