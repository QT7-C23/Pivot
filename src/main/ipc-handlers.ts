import { BrowserWindow, dialog, safeStorage, shell } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import path from 'node:path'
import type { IpcHandlerOptions, IpcRuntimeResources } from './ipc-handler-contracts'
import { requireActiveAxisProvider, requireSessionProjectRoot, unavailableUpdates } from './ipc-handler-support'
import { configureTrustedRendererUrl, handle } from './ipc-registration'
import { registerAxisSemanticReviewTelemetryIpc } from './axis-semantic-review-telemetry-ipc'
import { registerSessionLifecycleIpc } from './session-lifecycle-ipc'
import { AgentCliProfileRegistry } from './services/agent-cli-profiles'
import { AgentCliProfileStore } from './services/agent-cli-profile-store'
import { resolveAgentContext } from './services/agent-context'
import { AgentRuntime } from './services/agent-runtime'
import { DefaultAgentToolExecutor } from './services/agent-tool-executor'
import { GuardedAgentFileMutationRequiredAdapter } from './services/guarded-agent-file-mutation-required-adapter'
import { CommandRunner } from './services/command-runner'
import { ContextTimelineService } from './services/context-timeline'
import { FileCheckpointStore } from './services/file-checkpoints'
import { FileReviewStore } from './services/file-review'
import { AiSdkProviderAdapter } from './services/ai-sdk-provider-adapter'
import { AiSdkAxisPlanningModel } from './services/ai-sdk-axis-planning-model'
import { AiSdkAxisPivotModel } from './services/ai-sdk-axis-pivot-model'
import { AiSdkAxisSafeWriteProposalModel } from './services/ai-sdk-axis-safe-write-proposal-model'
import { AxisComplexityEvaluator } from './services/axis-complexity-evaluator'
import { AxisAuthorityAuditRegistry } from './services/axis-authority-audit-registry'
import { AxisDryRunCoordinator } from './services/axis-dry-run-coordinator'
import { AxisDryRunQualityEvaluator } from './services/axis-execution-quality'
import { AxisLeaseAwareRunStateStore } from './services/axis-lease-aware-run-state'
import { AxisMainLifecycleCoordinator } from './services/axis-main-lifecycle'
import { createAxisGuardedIpcRuntime } from './services/axis-guarded-ipc-runtime'
import { createAxisProductionPivotRuntime, resolveAxisDynamicPivotFeature } from './services/axis-production-pivot-runtime'
import { createAxisPivotGuardedContinuationRuntime } from './services/axis-pivot-guarded-continuation-runtime'
import { createAxisPivotReviewedContinuationRuntime } from './services/axis-pivot-reviewed-continuation-runtime'
import { createAxisPivotReplanReviewedTaskRuntime } from './services/axis-pivot-replan-reviewed-task-runtime'
import { createAxisPivotReplanRunDriveRuntime } from './services/axis-pivot-replan-run-drive-runtime'
import { createAxisPivotReplanTaskSchedulingRuntime } from './services/axis-pivot-replan-task-scheduling-runtime'
import { AxisMainProjectFileIdentityAdapter } from './services/axis-project-file-identity'
import { AxisRunLeaseLifecycleCoordinator } from './services/axis-run-lease-lifecycle'
import { AxisRunStateRegistry } from './services/axis-run-state-registry'
import {
  AxisMainSafeWriteProposalFileReaderAdapter,
  AxisSafeWriteProposalService,
} from './services/axis-safe-write-proposal'
import { AxisSettingsStore } from './services/axis-settings-store'
import { SqliteApplicationPreferencesAdapter } from './services/sqlite-application-preferences-adapter'
import { SqliteFeedbackAdapter } from './services/sqlite-feedback-adapter'
import { SqliteAttentionAdapter } from './services/sqlite-attention-adapter'
import { SqliteAgentRunEventAdapter } from './services/sqlite-agent-run-event-adapter'
import { AxisShadowRunCoordinator } from './services/axis-shadow-run-coordinator'
import { AxisShadowRunRegistry } from './services/axis-shadow-run-registry'
import { AxisTaskDecomposer } from './services/axis-task-decomposer'
import { AxisDryRunTaskExecutor } from './services/axis-task-executor'
import { AxisTraceRegistry } from './services/axis-trace-registry'
import { AxisWindowsNpmGateCommandAdapter } from './services/axis-windows-npm-gate-adapter'
import { createAxisReviewerSettingsRuntime } from './axis-reviewer-settings-runtime'
import { SqliteAxisFileLeaseStore } from './services/sqlite-axis-file-lease-store'
import { SqliteAxisProjectBindingStore } from './services/sqlite-axis-project-binding-store'
import {
  createProjectDirectory,
  createProjectFile,
  listProjectTree,
  listProjectFilePaths,
  readTextFile,
  resolvePathWithinRoot,
  searchProjectFiles,
} from './services/file-system'
import { chooseProjectDirectory } from './services/project-dialog'
import { NodeProjectCreationAdapter } from './services/node-project-creation-adapter'
import { ProjectAccessRegistry } from './services/project-access'
import { ProjectFileWatcher } from './services/project-file-watcher'
import { buildPlanGenerationPrompt, buildPlanStepPrompt, parseGeneratedPlan } from './services/plan-generation'
import { PlanRegistry } from './services/plan-registry'
import { PermissionManager } from './services/permission-manager'
import { testProviderConnection } from './services/provider-connection'
import { registerProviderModelProbeIpc } from './provider-model-probe-ipc'
import { ProviderStore } from './services/provider-store'
import { SessionRegistry } from './services/session-registry'
import { TerminalManager } from './services/terminal-manager'
import { registerMarketplaceIpc } from './marketplace-ipc'
import { SessionCapabilityRevocationCoordinator } from './session-capability-revocation'
import { SessionPermanentDeletionCoordinator } from './session-permanent-deletion'
import { AxisDryRunIpcOrchestrator } from './axis-dry-run-ipc-orchestrator'
import { IpcRuntimeShutdownCoordinator } from './ipc-runtime-shutdown'
import { registerSessionManagementIpc } from './session-management-ipc'
export type {
  AxisGuardedIpcInfrastructure,
  AxisPivotIpcInfrastructure,
  IpcHandlerOptions,
  IpcRuntimeResources,
  UpdateRuntime,
} from './ipc-handler-contracts'
export type { AxisGateCommandRunPort } from './services/axis-gate-runner'
export type { AxisLeaseLifecyclePort } from './services/axis-run-lease-lifecycle'
export function registerIpcHandlers(options: IpcHandlerOptions = {}): IpcRuntimeResources {
  const trace = options.trace ?? (() => undefined)
  const terminals = new TerminalManager()
  const commandRunner = new CommandRunner()
  configureTrustedRendererUrl(options.trustedRendererUrl)
  trace('ipc-core-start')
  const marketplaceResources = registerMarketplaceIpc({
    databasePath: options.databasePath,
    env: process.env,
    userDataPath: options.userDataPath,
  })
  const sessions = new SessionRegistry(options.databasePath)
  const agentRunEvents = new SqliteAgentRunEventAdapter({ databasePath: options.databasePath })
  trace('ipc-sessions-ready')
  const projectAccess = new ProjectAccessRegistry(sessions.list().map((session) => session.projectPath))
  const projectCreation = options.projectCreation ?? new NodeProjectCreationAdapter({ commandRunner })
  const checkpoints = new FileCheckpointStore(options.databasePath)
  const reviews = new FileReviewStore(options.databasePath)
  const plans = new PlanRegistry(options.databasePath)
  trace('ipc-project-stores-ready')
  const providers = new ProviderStore({
    decrypt(ciphertext) {
      if (!safeStorage.isEncryptionAvailable()) throw new Error('OS credential encryption is not available')
      return safeStorage.decryptString(Buffer.from(ciphertext, 'base64'))
    },
    encrypt(plaintext) {
      if (!safeStorage.isEncryptionAvailable()) throw new Error('OS credential encryption is not available')
      return safeStorage.encryptString(plaintext).toString('base64')
    },
  }, options.databasePath)
  const axisSettings = new AxisSettingsStore(options.databasePath)
  const applicationPreferences = new SqliteApplicationPreferencesAdapter({
    databasePath: options.databasePath,
  })
  const applicationPreferencesReader = applicationPreferences.openReaderPort()
  const applicationPreferencesWriter = applicationPreferences.openWriterPort()
  const feedback = new SqliteFeedbackAdapter({ databasePath: options.databasePath })
  const feedbackReader = feedback.openReaderPort()
  const feedbackWriter = feedback.openWriterPort()
  const feedbackAttachmentStaging = feedback.openAttachmentStagingPort()
  const feedbackAttachmentDiscard = feedback.openAttachmentDiscardPort()
  const attention = new SqliteAttentionAdapter({ databasePath: options.databasePath })
  const attentionReader = attention.openReaderPort()
  const attentionObservation = attention.openObservationPort()
  const attentionLifecycle = attention.openLifecyclePort()
  const axisTraces = new AxisTraceRegistry(options.databasePath)
  const axisRuns = new AxisShadowRunRegistry(options.databasePath)
  const axisRunStates = new AxisRunStateRegistry(options.databasePath)
  const axisAuthorityAudit = new AxisAuthorityAuditRegistry(options.databasePath)
  const axisProjectBindings = new SqliteAxisProjectBindingStore(options.databasePath)
  const axisProjectBindingReader = axisProjectBindings.openReaderPort()
  const axisProjectIdentity = new AxisMainProjectFileIdentityAdapter({
    projectBindings: axisProjectBindingReader,
  })
  const axisFileLeases = new SqliteAxisFileLeaseStore(
    axisProjectIdentity,
    options.databasePath,
  )
  const axisLeaseLifecycle = new AxisRunLeaseLifecycleCoordinator({
    leases: axisFileLeases,
  })
  const axisMainLifecycle = new AxisMainLifecycleCoordinator({
    bindings: axisProjectBindings,
    leases: axisLeaseLifecycle,
  })
  const leaseAwareRunStates = new AxisLeaseAwareRunStateStore({
    lifecycle: options.axisGuarded?.runLifecycle ?? axisLeaseLifecycle,
    states: axisRunStates,
  })
  const axisLifecycleReady = axisMainLifecycle.initialize(sessions.list())
  trace('ipc-provider-axis-stores-ready')
  const timeline = new ContextTimelineService({
    checkpoints,
    projectRootForSession: (sessionId) => sessions.getActive(sessionId)?.projectPath ?? null,
    reviews,
    sessions,
  })
  const fileWatcher = new ProjectFileWatcher()
  trace('ipc-file-services-ready')
  const agentTools = new DefaultAgentToolExecutor({
    commandRunner,
    fileMutation: new GuardedAgentFileMutationRequiredAdapter(),
    projectRootForSession: (sessionId) => sessions.getActive(sessionId)?.projectPath ?? null,
  })
  const profileStore = new AgentCliProfileStore(options.databasePath)
  const permissions = new PermissionManager({
    timeoutMs: options.axisGuarded?.permissionTimeoutMs,
  })
  trace('ipc-agent-profile-ready')
  const agents = new AgentRuntime({
    events: agentRunEvents.openWriterPort(),
    marketplaceAugmentations: marketplaceResources.agentAugmentations,
    permissions,
    profiles: new AgentCliProfileRegistry({
      profileStore,
    }),
    tools: agentTools,
  })
  const capabilityRevocation = new SessionCapabilityRevocationCoordinator({
    agents,
    terminals,
    watchers: fileWatcher,
  })
  const axisReviewerSettings = createAxisReviewerSettingsRuntime(providers, options.databasePath)
  const axisSemanticReview = axisReviewerSettings.semanticReview
  const axisPivot = createAxisProductionPivotRuntime({
    databasePath: options.databasePath,
    feature: resolveAxisDynamicPivotFeature(process.env),
    files: {
      list: (projectRoot) => listProjectFilePaths(projectRoot),
    },
    modelFactory: () => {
      const provider = requireActiveAxisProvider(providers)
      return new AiSdkAxisPivotModel(
        provider,
        providers.readSecret(provider.id),
      )
    },
    plannerFactory: () => {
      const provider = requireActiveAxisProvider(providers)
      const model = new AiSdkAxisPlanningModel(
        provider,
        providers.readSecret(provider.id),
      )
      return new AxisShadowRunCoordinator({
        complexityEvaluator: new AxisComplexityEvaluator(model),
        decomposer: new AxisTaskDecomposer(model),
        traces: axisTraces,
      })
    },
    plans: axisRuns,
    projects: axisProjectBindingReader,
    states: axisRunStates,
  })
  const axisGuarded = createAxisGuardedIpcRuntime({
    authorityAudit: axisAuthorityAudit,
    checkpoints,
    commandRunner: options.axisGuarded?.gateCommandRunner
      ?? new AxisWindowsNpmGateCommandAdapter({ runner: commandRunner }),
    databasePath: options.databasePath,
    env: process.env,
    fileLeases: axisFileLeases,
    identity: axisProjectIdentity,
    permissionManager: permissions,
    projectBindings: axisProjectBindingReader,
    runStates: leaseAwareRunStates.openGuardedExecutionPort(),
    sendSignal: (signal, payload) => {
      BrowserWindow.getAllWindows().forEach((window) => (
        window.webContents.send(signal, payload)
      ))
    },
    semanticReview: axisSemanticReview,
    tasks: axisRuns.openTaskReaderPort(),
  })
  const axisProposalReceipts = axisGuarded.openReviewedProposalIssuerPort()
  const axisProposalFiles = new AxisMainSafeWriteProposalFileReaderAdapter()
  const axisProposalRunStates = axisRunStates.openProposalPort()
  const axisProposalTasks = axisRuns.openTaskReaderPort()
  const axisProposalService = axisProposalReceipts
    ? new AxisSafeWriteProposalService({
        files: axisProposalFiles,
        model: {
          generate(input) {
            const provider = requireActiveAxisProvider(providers)
            return new AiSdkAxisSafeWriteProposalModel(
              provider,
              providers.readSecret(provider.id),
            ).generate(input)
          },
        },
        projects: axisProjectBindingReader,
        receipts: axisProposalReceipts,
        runStates: axisProposalRunStates,
        tasks: axisProposalTasks,
      })
    : null
  const axisPivotContinuations = createAxisPivotGuardedContinuationRuntime({
    authorization: axisPivot?.openContinuationAuthorizationPort() ?? null,
    databasePath: options.databasePath,
    submissions: axisGuarded.featureState().enabled
      ? axisGuarded.openSubmissionPort()
      : null,
  })
  const axisPivotReviewedContinuations = createAxisPivotReviewedContinuationRuntime({
    authorization: axisPivot?.openContinuationAuthorizationPort() ?? null,
    continuations: axisPivotContinuations,
    databasePath: options.databasePath,
    proposals: axisProposalService,
  })
  const axisPivotReplanTaskScheduling = createAxisPivotReplanTaskSchedulingRuntime({
    authorization: axisPivot?.openContinuationAuthorizationPort() ?? null,
    databasePath: options.databasePath,
    plans: axisRuns.openReplanTaskSchedulingReaderPort(),
    states: axisRunStates.openPivotActionReaderPort(),
  })
  const axisPivotReplanReviewedTasks = createAxisPivotReplanReviewedTaskRuntime({
    authorization: axisPivot?.openContinuationAuthorizationPort() ?? null,
    continuations: axisPivotContinuations,
    databasePath: options.databasePath,
    proposals: axisProposalService,
    schedules: axisPivotReplanTaskScheduling?.openReaderPort() ?? null,
  })
  const axisPivotReplanRunDriver = createAxisPivotReplanRunDriveRuntime({
    databasePath: options.databasePath,
    reviewedTasks: axisPivotReplanReviewedTasks,
    scheduler: axisPivotReplanTaskScheduling,
  })
  const permanentDeletion = new SessionPermanentDeletionCoordinator({
    capabilities: capabilityRevocation,
    lifecycle: axisMainLifecycle,
    ownedData: [
      agentRunEvents.openLifecyclePort(),
      checkpoints,
      reviews,
      plans,
      axisTraces,
      ...(axisPivot ? [axisPivot] : []),
      ...(axisPivotReviewedContinuations ? [axisPivotReviewedContinuations] : []),
      ...(axisPivotContinuations ? [axisPivotContinuations] : []),
      ...(axisPivotReplanRunDriver ? [axisPivotReplanRunDriver] : []),
      ...(axisPivotReplanReviewedTasks ? [axisPivotReplanReviewedTasks] : []),
      ...(axisPivotReplanTaskScheduling ? [axisPivotReplanTaskScheduling] : []),
      axisRuns,
      axisRunStates,
      axisAuthorityAudit,
      axisGuarded,
    ],
    sessions,
  })
  const dryRunOrchestrator = new AxisDryRunIpcOrchestrator({
    execute: async (request) => {
      const plan = axisRuns.get(request.runId)
      if (!plan || plan.trace.sessionId !== request.sessionId) throw new Error(`Axis Shadow plan not found: ${request.runId}`)
      const defaultExecutor = options.axisPivot?.dryRunExecutor ?? new AxisDryRunTaskExecutor()
      return new AxisDryRunCoordinator({
        executor: axisPivot?.trackDryRunExecutor(defaultExecutor) ?? defaultExecutor,
        quality: new AxisDryRunQualityEvaluator(),
        states: leaseAwareRunStates,
      }).execute(plan, request)
    },
    failureObserver: axisPivot,
    replanDriver: axisPivotReplanRunDriver,
    reviewedContinuations: axisPivotReviewedContinuations,
    stateReader: axisRunStates,
  })
  const shutdown = new IpcRuntimeShutdownCoordinator({
    capabilities: capabilityRevocation,
    lifecycle: axisMainLifecycle,
    resources: [
      axisPivot, axisPivotReviewedContinuations, axisPivotReplanRunDriver,
      axisPivotReplanReviewedTasks, axisPivotContinuations, axisPivotReplanTaskScheduling,
      axisGuarded, axisFileLeases, axisProjectBindings, axisAuthorityAudit, axisRunStates,
      axisRuns, axisTraces, axisSettings, axisReviewerSettings, applicationPreferences,
      ...marketplaceResources, feedback, attention, profileStore, providers, plans, reviews,
      checkpoints, agentRunEvents, sessions,
    ],
    sessions,
  })
  const runtimeReady = Promise.all([
    axisLifecycleReady,
    axisGuarded.ready,
    axisPivot?.ready,
    axisPivotContinuations?.ready,
    axisPivotReviewedContinuations?.ready,
    axisPivotReplanTaskScheduling?.ready,
    axisPivotReplanReviewedTasks?.ready,
    axisPivotReplanRunDriver?.ready,
  ]).then(() => undefined)
  trace('ipc-agent-runtime-ready')
  const updates = options.updates ?? unavailableUpdates()
  const activeProvider = providers.list().find((provider) => provider.isActive)
  if (activeProvider) {
    try {
      agents.useAdapter(new AiSdkProviderAdapter(activeProvider, providers.readSecret(activeProvider.id)))
    } catch {
      // Keep the configured CLI/local adapter when the OS credential store is unavailable.
    }
  }

  function axisShadowState(): import('../shared/axis-engine-contracts').AxisShadowState {
    if (!axisSettings.isShadowEnabled()) return { available: false, enabled: false, reason: 'disabled' }
    const provider = providers.list().find((candidate) => candidate.isActive)
    if (!provider) return { available: false, enabled: true, reason: 'no-active-provider' }
    if (!provider.hasApiKey) return { available: false, enabled: true, reason: 'provider-key-unavailable' }
    return { available: true, enabled: true, reason: null }
  }

  function axisDryRunState(): import('../shared/axis-engine-contracts').AxisDryRunFeatureState {
    return axisSettings.isDryRunEnabled() ? { enabled: true, reason: null } : { enabled: false, reason: 'disabled' }
  }

  handle('chat:send', async (request, event) => {
    const projectPath = requireSessionProjectRoot(sessions, request.sessionId)
    const context = await resolveAgentContext(projectPath, request.context)
    sessions.addMessage(request.sessionId, 'user', request.text)
    const assistantText = await agents.send({
      ...request,
      context,
    }, (signal, payload) => {
      event.sender.send(signal, payload)
    })
    if (assistantText) {
      sessions.addMessage(request.sessionId, 'assistant', assistantText)
    }
  })
  handle('attention:list', async () => attentionReader.list())
  handle('attention:observe', async (request) => attentionObservation.observe(request))
  handle('attention:resolve', async (request) => attentionLifecycle.resolve(request))
  handle('attention:reopen', async (request) => attentionLifecycle.reopen(request))
  handle('chat:abort', async ({ sessionId }) => agents.abort(sessionId))
  handle('chat:list', async ({ sessionId }) => sessions.listMessages(sessionId))
  handle('chat:permission', async ({ behavior, requestId }) => agents.resolvePermission(requestId, behavior))
  handle('agent:info', async () => agents.adapterInfo)
  handle('agent:profiles', async () => agents.listProfiles())
  handle('agent:configure-custom-profile', async (request) => agents.configureCustomProfile(request))
  handle('agent:select-profile', async ({ profileId }) => agents.selectProfile(profileId))
  handle('agent:run-cli-maintenance', async ({ action, profileId }) => agents.runCliMaintenance(profileId, action))

  handle('axis:shadow-state', async () => axisShadowState())
  handle('axis:set-shadow-enabled', async ({ enabled }) => {
    axisSettings.setShadowEnabled(enabled)
    return axisShadowState()
  })
  handle('axis:dry-run-state', async () => axisDryRunState())
  handle('axis:set-dry-run-enabled', async ({ enabled }) => {
    axisSettings.setDryRunEnabled(enabled)
    return axisDryRunState()
  })
  handle('axis:list-traces', async ({ sessionId }) => {
    requireSessionProjectRoot(sessions, sessionId)
    return axisTraces.list(sessionId)
  })
  handle('axis:list-shadow-runs', async ({ sessionId }) => {
    requireSessionProjectRoot(sessions, sessionId)
    return axisRuns.list(sessionId)
  })
  handle('axis:list-run-states', async ({ sessionId }) => {
    requireSessionProjectRoot(sessions, sessionId)
    return axisRunStates.list(sessionId)
  })
  handle('axis:cancel-run', async (request) => {
    await axisLifecycleReady
    requireSessionProjectRoot(sessions, request.sessionId)
    return leaseAwareRunStates.cancel(request)
  })
  handle('axis:restart-run', async (request) => {
    requireSessionProjectRoot(sessions, request.sessionId)
    return axisRunStates.restart(request)
  })
  handle('axis:execute-dry-run', async (request) => {
    await axisLifecycleReady
    if (!axisDryRunState().enabled) throw new Error('Axis dry-run execution is disabled')
    requireSessionProjectRoot(sessions, request.sessionId)
    return dryRunOrchestrator.execute(request)
  })
  handle('axis:guarded-safe-write-state', async () => (
    axisGuarded.featureState()
  ))
  handle('axis:propose-guarded-safe-write', async (request) => {
    await runtimeReady
    if (!axisGuarded.featureState().enabled) {
      throw new Error('Axis guarded safe-write execution is disabled')
    }
    if (!axisProposalService) {
      throw new Error('Axis reviewed proposal receipt issuance is disabled')
    }
    const state = axisShadowState()
    if (!state.available) {
      throw new Error(`Axis Shadow mode is unavailable: ${state.reason ?? 'unknown reason'}`)
    }
    requireSessionProjectRoot(sessions, request.sessionId)
    return axisProposalService.propose(request)
  })
  handle('axis:execute-guarded-safe-write', async (request) => {
    await runtimeReady
    requireSessionProjectRoot(sessions, request.sessionId)
    return axisGuarded.submit(request)
  })
  registerAxisSemanticReviewTelemetryIpc({
    authorizeSession: (sessionId) => { requireSessionProjectRoot(sessions, sessionId) },
    guarded: axisGuarded,
  })
  handle('axis:plan-shadow', async ({ budget, objective, sessionId }) => {
    const state = axisShadowState()
    if (!state.enabled) throw new Error('Axis Shadow mode is disabled')
    if (!state.available) throw new Error(`Axis Shadow mode is unavailable: ${state.reason ?? 'unknown reason'}`)
    const projectRoot = requireSessionProjectRoot(sessions, sessionId)
    const provider = providers.list().find((candidate) => candidate.isActive)!
    const model = new AiSdkAxisPlanningModel(provider, providers.readSecret(provider.id))
    const coordinator = new AxisShadowRunCoordinator({
      complexityEvaluator: new AxisComplexityEvaluator(model),
      decomposer: new AxisTaskDecomposer(model),
      traces: axisTraces,
    })
    const result = await coordinator.plan({
      budget,
      context: {
        availableFiles: await listProjectFilePaths(projectRoot),
        constraints: ['Shadow mode is planning-only. Do not execute tasks or mutate the workspace.'],
      },
      objective,
      sessionId,
    })
    const saved = axisRuns.save(result)
    axisRunStates.create(saved, budget)
    return saved
  })

  handle('fs:tree', async ({ sessionId }) => {
    const projectRoot = requireSessionProjectRoot(sessions, sessionId)
    return listProjectTree(projectRoot)
  })
  handle('fs:children', async ({ dirPath, sessionId }) => {
    const projectRoot = requireSessionProjectRoot(sessions, sessionId)
    return listProjectTree(dirPath, projectRoot)
  })
  handle('fs:read', async ({ filePath, sessionId }) =>
    readTextFile(requireSessionProjectRoot(sessions, sessionId), filePath),
  )
  handle('fs:search', async ({ limit, query, sessionId }) =>
    searchProjectFiles(requireSessionProjectRoot(sessions, sessionId), query, limit),
  )
  handle('fs:watch', async ({ sessionId }, event) => {
    const projectRoot = requireSessionProjectRoot(sessions, sessionId)
    await fileWatcher.watch(event.sender.id, sessionId, projectRoot, (change) => {
      event.sender.send('file:system-changed', change)
    })
  })
  handle('fs:create-file', async ({ name, parentPath, sessionId }) => {
    const projectRoot = requireSessionProjectRoot(sessions, sessionId)
    const parent = await resolvePathWithinRoot(projectRoot, parentPath)
    return createProjectFile(projectRoot, path.join(parent, name))
  })
  handle('fs:create-directory', async ({ name, parentPath, sessionId }) => {
    const projectRoot = requireSessionProjectRoot(sessions, sessionId)
    const parent = await resolvePathWithinRoot(projectRoot, parentPath)
    return createProjectDirectory(projectRoot, path.join(parent, name))
  })
  handle('fs:reveal', async ({ filePath, sessionId }) => {
    const projectRoot = requireSessionProjectRoot(sessions, sessionId)
    const resolved = await resolvePathWithinRoot(projectRoot, filePath)
    shell.showItemInFolder(resolved)
  })
  handle('fs:checkpoint', async ({ sessionId, filePath }) =>
    checkpoints.create(sessionId, requireSessionProjectRoot(sessions, sessionId), filePath),
  )
  handle('fs:list-checkpoints', async ({ sessionId }) => checkpoints.listForSession(sessionId))
  handle('fs:restore-checkpoint', async ({ checkpointId }) => {
    const checkpoint = checkpoints.get(checkpointId)
    if (!checkpoint) {
      throw new Error(`Checkpoint not found: ${checkpointId}`)
    }
    return checkpoints.restore(checkpointId, requireSessionProjectRoot(sessions, checkpoint.sessionId))
  })
  handle('fs:list-reviews', async ({ includeResolved, sessionId }) =>
    reviews.listForSession(sessionId, includeResolved),
  )
  handle('fs:get-review', async ({ reviewId }) => reviews.get(reviewId))
  handle('fs:resolve-review', async ({ resolution, reviewId }) => {
    const review = reviews.get(reviewId)
    if (!review) throw new Error(`File review not found: ${reviewId}`)
    return reviews.resolve(reviewId, requireSessionProjectRoot(sessions, review.sessionId), resolution)
  })
  handle('timeline:list', async ({ sessionId }) => {
    requireSessionProjectRoot(sessions, sessionId)
    return timeline.list(sessionId)
  })
  handle('timeline:restore-change', async ({ reviewId }) => timeline.restoreChange(reviewId))

  handle('project:choose-directory', async (request, event) => {
    const selectedPath = await chooseProjectDirectory({
      defaultPath: request?.defaultPath,
      window: BrowserWindow.fromWebContents(event.sender),
    })
    return selectedPath ? projectAccess.authorize(selectedPath) : null
  })
  handle('project:create', async (request) => {
    const result = await projectCreation.create(request)
    projectAccess.authorize(result.projectPath)
    return result
  })
  handle('project:recent', async () => sessions.listRecentProjects())
  handle('project:last', async () => sessions.getLastProject())

  handle('preview:open-external', async ({ url }) => {
    await shell.openExternal(url)
  })

  handle('settings:application-preferences', async () => applicationPreferencesReader.get())
  handle('settings:update-application-preferences', async (request) => (
    applicationPreferencesWriter.update(request)
  ))
  handle('settings:list-feedback', async () => feedbackReader.list())
  handle('settings:choose-feedback-attachments', async (_request, event) => {
    const owner = BrowserWindow.fromWebContents(event.sender)
    const options = {
      filters: [{
        extensions: ['gif', 'jpeg', 'jpg', 'json', 'log', 'md', 'png', 'txt', 'webp'],
        name: 'Feedback evidence',
      }],
      properties: ['openFile', 'multiSelections'] as Array<'openFile' | 'multiSelections'>,
      title: 'Choose feedback attachments',
    }
    const result = owner
      ? await dialog.showOpenDialog(owner, options)
      : await dialog.showOpenDialog(options)
    return result.canceled || result.filePaths.length === 0
      ? []
      : feedbackAttachmentStaging.stagePaths(result.filePaths)
  })
  handle('settings:discard-feedback-attachment', async ({ attachmentId }) => {
    feedbackAttachmentDiscard.discard(attachmentId)
  })
  handle('settings:submit-feedback', async (request) => feedbackWriter.submit(request))

  handle('update:state', async () => updates.state)
  handle('update:check', async () => updates.check())
  handle('update:download', async () => updates.download())
  handle('update:install', async () => updates.install())

  handle('plan:list', async ({ sessionId }) => {
    requireSessionProjectRoot(sessions, sessionId)
    return plans.list(sessionId)
  })
  handle('plan:list-all', async () => plans.listAll())
  handle('plan:generate', async ({ sessionId, source }, event) => {
    const projectPath = requireSessionProjectRoot(sessions, sessionId)
    const response = await agents.send({
      context: { interactionMode: 'agent', projectPath, reasoningEffort: 4 },
      sessionId,
      text: buildPlanGenerationPrompt(source),
      toolPolicy: 'read-only',
    }, (signal, payload) => event.sender.send(signal, payload))
    const plan = plans.create(sessionId, parseGeneratedPlan(response, source))
    event.sender.send('plan:updated', plan)
    return plan
  })
  handle('plan:update', async ({ draft, id }, event) => {
    const plan = plans.updateDraft(id, draft)
    event.sender.send('plan:updated', plan)
    return plan
  })
  handle('plan:approve', async ({ executionMode, id, selectedStepIds }, event) => {
    const plan = plans.approve(id, executionMode, selectedStepIds)
    event.sender.send('plan:updated', plan)
    return plan
  })
  handle('plan:execute', async ({ id }, event) => executePlan(id, false, event))
  handle('plan:execute-next', async ({ id }, event) => executePlan(id, true, event))
  handle('plan:cancel', async ({ id }, event) => {
    const plan = plans.setStatus(id, 'cancelled')
    agents.abort(plan.sessionId)
    event.sender.send('plan:updated', plan)
    return plan
  })

  handle('provider:list', async () => providers.list())
  registerProviderModelProbeIpc(providers)
  handle('provider:save', async (request) => providers.save(request))
  handle('provider:set-active', async ({ id }) => {
    const provider = providers.setActive(id)
    agents.useAdapter(new AiSdkProviderAdapter(provider, providers.readSecret(id)))
    return provider
  })
  handle('provider:test', async ({ id }) => {
    const provider = providers.get(id)
    if (!provider) throw new Error(`Provider not found: ${id}`)
    return testProviderConnection(provider, providers.readSecret(id))
  })
  handle('provider:delete', async ({ id }) => providers.delete(id))

  handle('term:create', async (request, event) => {
    const projectRoot = requireSessionProjectRoot(sessions, request.sessionId)
    const cwd = await resolvePathWithinRoot(projectRoot, request.cwd)
    return terminals.create({ ...request, cwd, ownerId: event.sender.id }, (signal, payload) => {
      event.sender.send(signal, payload)
    })
  })
  handle('term:write', async (request, event) => terminals.write(request, event.sender.id))
  handle('term:resize', async (request, event) => terminals.resize(request, event.sender.id))
  handle('term:destroy', async ({ id }, event) => terminals.destroy(id, event.sender.id))
  registerSessionLifecycleIpc({
    capabilities: {
      revokeSession: (id) => capabilityRevocation.revokeSession(id),
    },
    lifecycle: axisMainLifecycle,
    lifecycleReady: axisLifecycleReady,
    sessions,
  })
  registerSessionManagementIpc({
    adapterInfo: () => agents.adapterInfo,
    deletion: permanentDeletion,
    lifecycle: axisMainLifecycle,
    lifecycleReady: axisLifecycleReady,
    projectAccess,
    sessions,
  })

  return {
    async close() {
      await shutdown.close()
    },
    async disposeRenderer(webContentsId) {
      await capabilityRevocation.revokeRenderer(webContentsId)
      agents.abortAll()
    },
    ready: runtimeReady,
  }

  async function executePlan(id: string, oneStepOnly: boolean, event: IpcMainInvokeEvent): Promise<import('../shared/types/domain').PlanDocument> {
    let plan = plans.get(id)
    if (!plan) throw new Error(`Plan not found: ${id}`)
    if (plan.status !== 'ready' && plan.status !== 'paused' && plan.status !== 'executing') throw new Error('Approve the plan before execution')
    requireSessionProjectRoot(sessions, plan.sessionId)
    plan = plans.setStatus(id, 'executing')
    event.sender.send('plan:updated', plan)

    do {
      const step = plans.nextPending(id)
      if (!step) break
      plan = plans.setStepStatus(id, step.id, 'running')
      event.sender.send('plan:updated', plan)
      try {
        const response = await agents.send({
          context: { interactionMode: 'agent', projectPath: requireSessionProjectRoot(sessions, plan.sessionId), reasoningEffort: 4 },
          sessionId: plan.sessionId,
          text: buildPlanStepPrompt(plan.title, plan.source, step),
        }, (signal, payload) => event.sender.send(signal, payload))
        if (response) sessions.addMessage(plan.sessionId, 'assistant', response)
        plan = plans.setStepStatus(id, step.id, response === null ? 'error' : 'done')
      } catch (error) {
        plans.setStepStatus(id, step.id, 'error')
        plan = plans.setStatus(id, 'paused')
        event.sender.send('plan:updated', plan)
        throw error
      }
      event.sender.send('plan:updated', plan)
      if (oneStepOnly || plan.executionMode === 'step') break
    } while (plans.nextPending(id))

    const hasPending = plans.nextPending(id) !== null
    const hasError = plans.get(id)?.steps.some((step) => step.status === 'error') ?? false
    plan = plans.setStatus(id, hasPending || hasError ? 'paused' : 'done')
    event.sender.send('plan:updated', plan)
    return plan
  }
}
