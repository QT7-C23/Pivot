import { FileCode2 } from 'lucide-react'
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import type { FileSearchEntry, SessionRecord } from '../shared/types/domain'
import { AgentStatusPanel, PermissionDialogQueue } from './components/agent-status-panel'
import { AttentionCenter, projectAttentionItems } from './components/attention-center'
import { ArtifactReviewContextSidebar, ArtifactReviewInspector } from './components/artifact-review-chrome'
import { AxisShadowPanel } from './components/axis-shadow-panel'
import { ChatWorkspace } from './components/chat-workspace'
import { CommandPalette } from './components/command-palette'
import { ContextTimelineWorkspace } from './components/context-timeline-workspace'
import { DocsFilesWorkspace } from './components/docs-files-workspace'
import { HelpWorkspace } from './components/help-workspace'
import { NowWorkspace } from './components/now-workspace'
import { PlanWorkspace } from './components/plan-workspace'
import { PivotAppShell } from './components/pivot-app-shell'
import { PreviewWorkspace } from './components/preview-workspace'
import { ProjectOverviewWorkspace } from './components/project-overview-workspace'
import { RuntimeHubWorkspace } from './components/runtime-hub-workspace'
import { RuntimeExecutableDialog } from './components/runtime-executable-dialog'
import { WorkCenterWorkspace } from './components/work-center-workspace'
import { WorkPlanContextSidebar, WorkPlanInspector } from './components/work-plan-chrome'
import { WorkspaceContextSidebar } from './components/workspace-context-sidebar'
import { TerminalWorkspace } from './components/terminal-workspace'
import { WelcomeScreen } from './components/welcome-screen'
import { useQuickCaptureSignal } from './hooks/useQuickCaptureSignal'
import { useSendMessage } from './hooks/useSendMessage'
import { usePivotAppBootstrap } from './hooks/usePivotAppBootstrap'
import { useLocale } from './i18n/locale-context'
import { createCommandPaletteItems, type CommandPaletteAction } from './command-palette/command-palette-model'
import type { PivotNavigationTarget, PivotRoute } from './navigation/pivot-navigation'
import { useAgentStore } from './stores/agent.store'
import { useAxisSemanticReviewTelemetryStore } from './stores/axis-semantic-review-telemetry.store'
import { useChatStore } from './stores/chat.store'
import { useContextTimelineStore } from './stores/context-timeline.store'
import { useFileStore } from './stores/file.store'
import { useFileReviewStore } from './stores/file-review.store'
import { usePermissionStore } from './stores/permission.store'
import { usePlanStore } from './stores/plan.store'
import { useSessionStore } from './stores/session.store'
import { useTerminalStore } from './stores/terminal.store'
import { useUIStore, type WorkspaceActivity } from './stores/ui.store'
import { projectLegacyWorkItems } from './adapters/work-model-adapter'
import { projectService } from './services/project.service'
import { EditorLoadingState, SettingsLoadingState } from './components/workspace-loading-states'
import { usePivotKeyboardNavigation } from './hooks/usePivotKeyboardNavigation'

const EditorWorkspace = lazy(() =>
  import('./components/editor-workspace').then((module) => ({ default: module.EditorWorkspace })),
)
const FileReviewWorkspace = lazy(() =>
  import('./components/file-review-workspace').then((module) => ({ default: module.FileReviewWorkspace })),
)
const SettingsWorkspace = lazy(() =>
  import('./components/settings-workspace').then((module) => ({ default: module.SettingsWorkspace })),
)
const AutomationWorkspace = lazy(() =>
  import('./components/automation-workspace').then((module) => ({ default: module.AutomationWorkspace })),
)
const ExtensionsEmptyWorkspace = lazy(() =>
  import('./components/extensions-empty-workspace').then((module) => ({ default: module.ExtensionsEmptyWorkspace })),
)
const PluginEcosystemPage = lazy(() =>
  import('./components/plugin-ecosystem-page').then((module) => ({ default: module.PluginEcosystemPage })),
)
const NewProjectDialog = lazy(() =>
  import('./components/new-project-dialog').then((module) => ({ default: module.NewProjectDialog })),
)

export function App(): ReactElement {
  const { locale, setLocale, t } = useLocale()
  const setTheme = useUIStore((state) => state.setTheme)
  usePivotAppBootstrap(locale, setLocale, setTheme)
  const workTabs = locale === 'zh-CN'
    ? { artifacts: '成果', conversation: '对话', plan: '计划', runs: '运行' }
    : locale === 'ja'
      ? { artifacts: '成果物', conversation: '会話', plan: '計画', runs: '実行' }
      : locale === 'de'
        ? { artifacts: 'Ergebnisse', conversation: 'Unterhaltung', plan: 'Plan', runs: 'Ausführungen' }
        : { artifacts: 'Artifacts', conversation: 'Conversation', plan: 'Plan', runs: 'Runs' }

  const [projectPath, setProjectPath] = useState('')
  const [quickOpenQuery, setQuickOpenQuery] = useState('')
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [newProjectOpen, setNewProjectOpen] = useState(false)
  const [newProjectBusy, setNewProjectBusy] = useState(false)
  const [newProjectError, setNewProjectError] = useState<string | null>(null)
  const [quickCaptureFocusRequest, setQuickCaptureFocusRequest] = useState(0)
  const [activeRoute, setActiveRoute] = useState<PivotRoute>('now')
  const [workView, setWorkView] = useState<'overview' | 'plan' | 'timeline'>('plan')
  const [showWelcome, setShowWelcome] = useState(() => localStorage.getItem('pivot:onboarding-complete') !== '1')
  const restoredProjectRef = useRef(false)
  const sendMessage = useSendMessage()

  const setWorkspaceActivity = useUIStore((state) => state.setWorkspaceActivity)
  const sessionView = useUIStore((state) => state.sessionView)
  const setSessionView = useUIStore((state) => state.setSessionView)
  const chatSubmode = useUIStore((state) => state.chatSubmode)
  const setChatSubmode = useUIStore((state) => state.setChatSubmode)
  const reasoningEffort = useUIStore((state) => state.reasoningEffort)
  const setReasoningEffort = useUIStore((state) => state.setReasoningEffort)
  const theme = useUIStore((state) => state.theme)

  const handleQuickCapture = useCallback(() => {
    localStorage.setItem('pivot:onboarding-complete', '1')
    setShowWelcome(false)
    setActiveRoute('sessions')
    setSessionView('conversation')
    setQuickCaptureFocusRequest((request) => request + 1)
  }, [setSessionView])
  useQuickCaptureSignal(handleQuickCapture)

  const adapterInfo = useAgentStore((state) => state.adapterInfo)
  const agentError = useAgentStore((state) => state.error)
  const agentState = useAgentStore((state) => state.state)
  const cliProfiles = useAgentStore((state) => state.cliProfiles)
  const currentTask = useAgentStore((state) => state.currentTask)
  const dismissMaintenanceResult = useAgentStore((state) => state.dismissMaintenanceResult)
  const lastMaintenanceResult = useAgentStore((state) => state.lastMaintenanceResult)
  const maintenanceInProgress = useAgentStore((state) => state.maintenanceInProgress)
  const loadAdapterInfo = useAgentStore((state) => state.loadAdapterInfo)
  const loadCliProfiles = useAgentStore((state) => state.loadCliProfiles)
  const operations = useAgentStore((state) => state.operations)
  const runCliMaintenance = useAgentStore((state) => state.runCliMaintenance)
  const resetRunState = useAgentStore((state) => state.resetRunState)
  const selectCliProfile = useAgentStore((state) => state.selectCliProfile)
  const tokenUsage = useAgentStore((state) => state.tokenUsage)

  const semanticReviewTelemetryError = useAxisSemanticReviewTelemetryStore((state) => state.error)
  const semanticReviewTelemetryLoading = useAxisSemanticReviewTelemetryStore((state) => state.isLoading)
  const semanticReviewTelemetryPage = useAxisSemanticReviewTelemetryStore((state) => state.page)
  const clearSemanticReviewTelemetry = useAxisSemanticReviewTelemetryStore((state) => state.clear)
  const loadSemanticReviewTelemetry = useAxisSemanticReviewTelemetryStore((state) => state.load)

  const abortStream = useChatStore((state) => state.abortStream)
  const activeRunId = useChatStore((state) => state.activeRunId)
  const chatError = useChatStore((state) => state.error)
  const isStreaming = useChatStore((state) => state.isStreaming)
  const loadMessages = useChatStore((state) => state.loadMessages)
  const messages = useChatStore((state) => state.messages)
  const setChatError = useChatStore((state) => state.setError)
  const streamPhase = useChatStore((state) => state.streamPhase)

  const timelineEntries = useContextTimelineStore((state) => state.entries)
  const clearTimeline = useContextTimelineStore((state) => state.clear)
  const timelineError = useContextTimelineStore((state) => state.error)
  const isTimelineLoading = useContextTimelineStore((state) => state.isLoading)
  const lastTimelineRestore = useContextTimelineStore((state) => state.lastRestore)
  const loadTimeline = useContextTimelineStore((state) => state.load)
  const restoreTimelineChange = useContextTimelineStore((state) => state.restoreChange)
  const undoTimelineRestore = useContextTimelineStore((state) => state.undoLastRestore)

  const activeFileContent = useFileStore((state) => state.activeFileContent)
  const activeFilePath = useFileStore((state) => state.activeFilePath)
  const clearSearch = useFileStore((state) => state.clearSearch)
  const clearFileChange = useFileStore((state) => state.clearChange)
  const collapseDirectory = useFileStore((state) => state.collapseDirectory)
  const createDirectory = useFileStore((state) => state.createDirectory)
  const createFile = useFileStore((state) => state.createFile)
  const expandDirectory = useFileStore((state) => state.expandDirectory)
  const fileError = useFileStore((state) => state.error)
  const files = useFileStore((state) => state.tree)
  const isSearching = useFileStore((state) => state.isSearching)
  const loadTree = useFileStore((state) => state.loadTree)
  const openFile = useFileStore((state) => state.openFile)
  const revealFile = useFileStore((state) => state.reveal)
  const fileRootPath = useFileStore((state) => state.rootPath)
  const searchFiles = useFileStore((state) => state.searchFiles)
  const searchResults = useFileStore((state) => state.searchResults)

  const activeReview = useFileReviewStore((state) => state.activeReview)
  const clearActiveReview = useFileReviewStore((state) => state.clearActive)
  const fileReviewError = useFileReviewStore((state) => state.error)
  const loadFileReviews = useFileReviewStore((state) => state.load)
  const fileReviews = useFileReviewStore((state) => state.reviews)
  const openReviewById = useFileReviewStore((state) => state.openById)
  const openReviewForFile = useFileReviewStore((state) => state.openForFile)
  const resolveActiveReview = useFileReviewStore((state) => state.resolveActive)

  const permissionError = usePermissionStore((state) => state.error)
  const permissionRequests = usePermissionStore((state) => state.pending)
  const respondToPermission = usePermissionStore((state) => state.respond)

  const activePlan = usePlanStore((state) => state.activePlan)
  const approvePlan = usePlanStore((state) => state.approve)
  const cancelPlan = usePlanStore((state) => state.cancel)
  const executePlan = usePlanStore((state) => state.execute)
  const executeNextPlanStep = usePlanStore((state) => state.executeNext)
  const generatePlan = usePlanStore((state) => state.generate)
  const isPlanBusy = usePlanStore((state) => state.isBusy)
  const loadPlans = usePlanStore((state) => state.load)
  const loadAllPlans = usePlanStore((state) => state.loadAll)
  const planError = usePlanStore((state) => state.error)
  const plans = usePlanStore((state) => state.plans)

  const activeSessionId = useSessionStore((state) => state.activeSessionId)
  const chooseProjectDirectory = useSessionStore((state) => state.chooseProjectDirectory)
  const exportSession = useSessionStore((state) => state.exportSession)
  const lastProject = useSessionStore((state) => state.lastProject)
  const loadProjectHistory = useSessionStore((state) => state.loadProjectHistory)
  const loadSessions = useSessionStore((state) => state.loadSessions)
  const openProjectSession = useSessionStore((state) => state.openProjectSession)
  const sessionError = useSessionStore((state) => state.error)
  const sessions = useSessionStore((state) => state.sessions)
  const setActiveSession = useSessionStore((state) => state.setActiveSession)
  const updateSession = useSessionStore((state) => state.updateSession)

  const activeTerminalId = useTerminalStore((state) => state.activeTerminalId)
  const createTerminal = useTerminalStore((state) => state.createTerminal)
  const destroyTerminal = useTerminalStore((state) => state.destroyTerminal)
  const ensureTerminalForProject = useTerminalStore((state) => state.ensureTerminalForProject)
  const resizeActive = useTerminalStore((state) => state.resizeActive)
  const sendToActive = useTerminalStore((state) => state.sendToActive)
  const setActiveTerminal = useTerminalStore((state) => state.setActiveTerminal)
  const terminalError = useTerminalStore((state) => state.error)
  const terminals = useTerminalStore((state) => state.instances)

  const activeSession = sessions.find((session) => session.id === activeSessionId) ?? null
  const activeSessionView = sessionView
  const error = agentError ?? chatError ?? fileError ?? fileReviewError ?? permissionError ?? planError ?? sessionError ?? terminalError ?? timelineError
  const attentionItems = useMemo(() => projectAttentionItems({ error, permissionRequests }), [error, permissionRequests])
  const workItems = useMemo(() => projectLegacyWorkItems({
    activeRunId,
    activeSessionId,
    adapterInfo,
    agentError,
    agentState,
    fileReviews,
    permissionRequests,
    plans,
    sessions,
  }), [activeRunId, activeSessionId, adapterInfo, agentError, agentState, fileReviews, permissionRequests, plans, sessions])
  const commandPaletteItems = useMemo(() => createCommandPaletteItems({
    fileResults: searchResults,
    locale,
    sessions,
  }), [locale, searchResults, sessions])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('pivot:theme', theme)
  }, [theme])

  const applyNavigationTarget = useCallback((target: PivotNavigationTarget): void => {
    setActiveRoute(target.route)
    if (target.sessionView) setSessionView(target.sessionView)
  }, [setSessionView])
  const openCommandPalette = useCallback(() => setCommandPaletteOpen(true), [])
  usePivotKeyboardNavigation({ activeRoute, applyNavigationTarget, openCommandPalette })

  async function openProjectPath(nextProjectPath: string): Promise<void> {
    const trimmed = nextProjectPath.trim()
    if (!trimmed) return

    setProjectPath(trimmed)
    const session = await openProjectSession(trimmed)
    await Promise.all([loadTree(session.id, session.projectPath), ensureTerminalForProject(session.id, session.projectPath)])
  }

  async function chooseProject(): Promise<void> {
    const selectedProjectPath = await chooseProjectDirectory(projectPath.trim() || undefined)
    if (selectedProjectPath) await openProjectPath(selectedProjectPath)
  }

  async function createProject(request: Parameters<typeof projectService.create>[0], profileId: Parameters<typeof selectCliProfile>[0]): Promise<void> {
    setNewProjectBusy(true)
    setNewProjectError(null)
    try {
      const result = await projectService.create(request)
      await selectCliProfile(profileId)
      await openProjectPath(result.projectPath)
      setActiveRoute('sessions')
      setSessionView('conversation')
      setNewProjectOpen(false)
    } catch (error) {
      setNewProjectError(error instanceof Error ? error.message : 'Failed to create project')
    } finally {
      setNewProjectBusy(false)
    }
  }
  async function openSession(session: SessionRecord): Promise<void> {
    setProjectPath(session.projectPath)
    setActiveSession(session.id)
    setActiveRoute('sessions')
    setSessionView('conversation')
    if (session.isUnread) await updateSession(session.id, { isUnread: false })
    await Promise.all([loadTree(session.id, session.projectPath), ensureTerminalForProject(session.id, session.projectPath)])
  }
  function openWorkPlan(sessionId: string): void {
    const session = sessions.find((candidate) => candidate.id === sessionId)
    if (!session) return
    setProjectPath(session.projectPath)
    setActiveSession(session.id)
    setWorkView('plan')
    setWorkspaceActivity('plan')
  }
  function openProjectTask(sessionId: string): void {
    const session = sessions.find((candidate) => candidate.id === sessionId)
    if (!session) return
    setProjectPath(session.projectPath)
    setActiveSession(session.id)
    setWorkView('plan')
    setWorkspaceActivity('plan')
    setActiveRoute('work')
  }

  async function openProjectArtifact(artifactId: string, sessionId: string): Promise<void> {
    setActiveSession(sessionId)
    const reviewId = artifactId.startsWith('artifact:') ? artifactId.slice('artifact:'.length) : artifactId
    if (await openReviewById(reviewId)) {
      setSessionView('editor')
      setActiveRoute('artifacts')
    }
  }

  async function exportSessionToClipboard(id: string, format: 'markdown' | 'json'): Promise<void> {
    const content = await exportSession(id, format)
    await navigator.clipboard.writeText(content)
  }

  async function openFileInEditor(path: string): Promise<void> {
    setSessionView('editor')
    if (await openReviewForFile(path)) return
    clearActiveReview()
    await openFile(path)
  }

  async function openDocument(path: string): Promise<void> {
    await openFileInEditor(path)
    setActiveRoute('sessions')
    setSessionView('editor')
  }

  async function openTimelineReview(reviewId: string): Promise<void> {
    if (!await openReviewById(reviewId)) return
    setWorkspaceActivity('files')
    setSessionView('editor')
  }

  async function restoreFromTimeline(reviewId: string): Promise<void> {
    const result = await restoreTimelineChange(reviewId)
    if (!result || !activeSessionId || !activeSession) return
    await Promise.all([
      loadMessages(activeSessionId),
      loadFileReviews(activeSessionId),
      loadTree(activeSessionId, activeSession.projectPath),
    ])
  }

  async function undoTimelineChange(): Promise<void> {
    if (!await undoTimelineRestore() || !activeSessionId || !activeSession) return
    await Promise.all([
      loadFileReviews(activeSessionId),
      loadTree(activeSessionId, activeSession.projectPath),
    ])
  }

  async function resolveReview(resolution: Parameters<typeof resolveActiveReview>[0]): Promise<void> {
    const resolved = await resolveActiveReview(resolution)
    if (!resolved) return
    if (resolved.status !== 'pending') {
      clearActiveReview()
      clearFileChange(resolved.filePath)
      await openFile(resolved.filePath)
    }
  }

  async function openSearchResult(result: FileSearchEntry): Promise<void> {
    await openFileInEditor(result.path)
    setQuickOpenQuery('')
    clearSearch()
  }

  function closeCommandPalette(): void {
    setCommandPaletteOpen(false)
    setQuickOpenQuery('')
    clearSearch()
  }

  function executeCommandPaletteAction(action: CommandPaletteAction): void {
    closeCommandPalette()
    if (action.kind === 'navigate') {
      navigate(action.target.route)
      if (action.target.sessionView) setSessionView(action.target.sessionView)
      return
    }
    if (action.kind === 'open-file') {
      void openDocument(action.path)
      return
    }
    if (action.kind === 'open-session') {
      const session = sessions.find((candidate) => candidate.id === action.sessionId)
      if (session) void openSession(session)
    }
  }

  async function abortMessage(): Promise<void> {
    if (!activeSessionId) return
    abortStream()
    try {
      await window.pivot.invoke('chat:abort', { sessionId: activeSessionId })
    } catch (abortError) {
      setChatError(abortError instanceof Error ? abortError.message : 'Failed to stop the Agent')
    }
  }

  function selectActivity(activity: WorkspaceActivity): void {
    setWorkspaceActivity(activity)
    if (activity === 'sessions') setSessionView('conversation')
    if (activity === 'files') setSessionView('editor')
    if (activity === 'timeline' && activeSessionId) void loadTimeline(activeSessionId)
  }

  useEffect(() => {
    void Promise.all([loadSessions(), loadProjectHistory(), loadAdapterInfo(), loadCliProfiles(), loadAllPlans()])
  }, [loadAdapterInfo, loadAllPlans, loadCliProfiles, loadProjectHistory, loadSessions])

  useEffect(() => {
    if (restoredProjectRef.current || !lastProject) return
    restoredProjectRef.current = true
    void openProjectPath(lastProject.path)
  }, [lastProject])

  useEffect(() => {
    if (activeSessionId) {
      void Promise.all([loadMessages(activeSessionId), loadFileReviews(activeSessionId), loadPlans(activeSessionId), loadTimeline(activeSessionId), loadSemanticReviewTelemetry(activeSessionId)])
    } else {
      clearTimeline()
      clearSemanticReviewTelemetry()
    }
    resetRunState()
  }, [activeSessionId, clearSemanticReviewTelemetry, clearTimeline, loadFileReviews, loadMessages, loadPlans, loadSemanticReviewTelemetry, loadTimeline, resetRunState])

  useEffect(() => {
    const query = quickOpenQuery.trim()
    if (query.length < 2 || !activeSessionId) {
      clearSearch()
      return undefined
    }
    const timeoutId = window.setTimeout(() => void searchFiles(query), 180)
    return () => window.clearTimeout(timeoutId)
  }, [activeSessionId, clearSearch, projectPath, quickOpenQuery, searchFiles])

  function finishWelcome(route: 'sessions' | 'projects'): void {
    localStorage.setItem('pivot:onboarding-complete', '1')
    setShowWelcome(false)
    setActiveRoute(route)
    if (route === 'sessions') setSessionView('conversation')
  }

  function navigate(route: PivotRoute): void {
    setActiveRoute(route)
    if (route === 'sessions' || route === 'now') {
      if (route === 'sessions') setSessionView('conversation')
      return
    }
    if (route === 'projects' || route === 'artifacts') {
      setWorkspaceActivity('files')
      setSessionView('editor')
    }
    if (route === 'work') {
      setWorkView('plan')
      setWorkspaceActivity('plan')
    }
  }

  if (showWelcome) {
    return (
      <WelcomeScreen
        onChooseProject={async () => {
          await chooseProject()
          finishWelcome('projects')
        }}
        onOpenSettings={() => {
          localStorage.setItem('pivot:onboarding-complete', '1')
          setShowWelcome(false)
          setActiveRoute('settings')
        }}
        onStart={() => finishWelcome('sessions')}
      />
    )
  }

  const nowContextSidebar = (
    <WorkspaceContextSidebar
      activeSessionId={activeSessionId}
      onOpenSession={openSession}
      sessions={sessions}
      variant="now"
    />
  )

  const projectContextSidebar = (
    <WorkspaceContextSidebar
      activeSessionId={activeSessionId}
      onOpenSession={openSession}
      projectPath={projectPath || activeSession?.projectPath || lastProject?.path || ''}
      sessions={sessions}
      variant="project"
    />
  )

  const agentPanel = activeRoute === 'sessions' ? (
    <AgentStatusPanel
      abortStream={abortMessage}
      agentLabel={adapterInfo?.label ?? 'Pivot Agent'}
      agentState={agentState}
      currentTask={currentTask}
      isStreaming={isStreaming}
      operations={operations}
      permissionRequests={permissionRequests}
      streamPhase={streamPhase}
      tokenUsage={tokenUsage}
    />
  ) : activeRoute === 'work' ? (
    <WorkPlanInspector adapterInfo={adapterInfo} plan={activePlan} />
  ) : activeRoute === 'artifacts' ? (
    <ArtifactReviewInspector review={activeReview} resolveReview={resolveReview} />
  ) : undefined

  const contextSidebar = activeRoute === 'now'
    ? nowContextSidebar
    : activeRoute === 'sessions'
      ? nowContextSidebar
    : activeRoute === 'projects'
      ? sessions.length > 0 ? projectContextSidebar : undefined
      : activeRoute === 'artifacts'
        ? <ArtifactReviewContextSidebar activeReview={activeReview} reviews={fileReviews} />
      : activeRoute === 'work'
        ? <WorkPlanContextSidebar plan={activePlan} session={activeSession} />
        : undefined

  return (
    <PivotAppShell
      activeRoute={activeRoute}
      activityPanel={agentPanel}
      commandPaletteOpen={commandPaletteOpen}
      contextSidebar={contextSidebar}
      onNavigate={navigate}
      onOpenCommandPalette={() => setCommandPaletteOpen(true)}
    >
      <CommandPalette
        isOpen={commandPaletteOpen}
        isSearching={isSearching}
        items={commandPaletteItems}
        locale={locale}
        onClose={closeCommandPalette}
        onExecute={executeCommandPaletteAction}
        onQueryChange={setQuickOpenQuery}
      />
      {newProjectOpen && <Suspense fallback={null}>
        <NewProjectDialog
          busy={newProjectBusy}
          error={newProjectError}
          isOpen
          onBrowse={chooseProjectDirectory}
          onCancel={() => { setNewProjectOpen(false); setNewProjectError(null) }}
          onCreate={createProject}
          profiles={cliProfiles}
        />
      </Suspense>}
      <PermissionDialogQueue requests={permissionRequests} respond={respondToPermission} />
      <AttentionCenter items={attentionItems} onReviewPermission={() => navigate('sessions')} onSwitchRuntime={() => navigate('runtimes')} />
      {lastMaintenanceResult?.unavailable && (
        <RuntimeExecutableDialog
          busy={maintenanceInProgress !== null}
          onClose={dismissMaintenanceResult}
          onRescan={() => void runCliMaintenance(lastMaintenanceResult.profileId, lastMaintenanceResult.action)}
          onSwitchRuntime={() => void selectCliProfile('local').then(dismissMaintenanceResult)}
          profile={cliProfiles.find((profile) => profile.id === lastMaintenanceResult.profileId)}
          result={lastMaintenanceResult}
        />
      )}

      {activeRoute === 'now' && (
        <NowWorkspace
          attentionMessage={error}
          isStreaming={isStreaming}
          onCreateProject={() => setNewProjectOpen(true)}
          onNavigateToAutomations={() => navigate('automations')}
          onNavigateToExtensions={() => navigate('extensions')}
          onNavigateToProjects={() => navigate('projects')}
          onOpenSession={openSession}
          operationCount={operations.length}
          sessions={sessions}
          workItems={workItems}
        />
      )}

      {activeRoute === 'runtimes' && (
        <RuntimeHubWorkspace
          adapterInfo={adapterInfo}
          lastMaintenanceResult={lastMaintenanceResult}
          maintenanceInProgress={maintenanceInProgress}
          profiles={cliProfiles}
          runCliMaintenance={runCliMaintenance}
          semanticReviewTelemetryError={semanticReviewTelemetryError}
          semanticReviewTelemetryLoading={semanticReviewTelemetryLoading}
          semanticReviewTelemetryPage={semanticReviewTelemetryPage}
          selectCliProfile={selectCliProfile}
        />
      )}

      {activeRoute === 'marketplace' && <Suspense fallback={<SettingsLoadingState />}><PluginEcosystemPage onConfigure={() => navigate('settings')} surface="marketplace" /></Suspense>}
      {activeRoute === 'extensions' && <Suspense fallback={null}><ExtensionsEmptyWorkspace onBrowseMarketplace={() => navigate('marketplace')} /></Suspense>}

      {activeRoute === 'docs' && (
        <DocsFilesWorkspace
          files={files}
          onChooseProject={() => void chooseProject()}
          onOpenFile={(path) => void openDocument(path)}
          projectPath={projectPath || activeSession?.projectPath || lastProject?.path || ''}
        />
      )}

      {activeRoute === 'help' && <HelpWorkspace onNavigate={navigate} />}

      {activeRoute === 'settings' && (
        <section className="settings-workbench pv-settings-workbench">
          <Suspense fallback={<SettingsLoadingState />}>
            <SettingsWorkspace
              adapterInfo={adapterInfo}
              lastMaintenanceResult={lastMaintenanceResult}
              maintenanceInProgress={maintenanceInProgress}
              onClose={() => navigate('projects')}
              profiles={cliProfiles}
              reasoningEffort={reasoningEffort}
              runCliMaintenance={runCliMaintenance}
              selectCliProfile={selectCliProfile}
              setReasoningEffort={setReasoningEffort}
              setTheme={setTheme}
              theme={theme}
            />
          </Suspense>
        </section>
      )}

      {activeRoute === 'automations' && (
        <Suspense fallback={null}><AutomationWorkspace onBrowseTemplates={() => navigate('marketplace')} snapshot={{ items: [], runtimeAvailable: false, selectedId: null }} /></Suspense>
      )}

      {activeRoute === 'projects' && (
        <ProjectOverviewWorkspace
          activeProjectPath={projectPath || activeSession?.projectPath || lastProject?.path || ''}
          onBrowseTemplates={() => navigate('marketplace')}
          onCreateProject={() => setNewProjectOpen(true)}
          onImportProject={() => void chooseProject()}
          onOpenArtifact={(artifact) => void openProjectArtifact(artifact.id, artifact.sessionId)}
          onOpenTask={openProjectTask}
          sessions={sessions}
          workItems={workItems}
        />
      )}

      {activeRoute === 'artifacts' && (
        <Suspense fallback={<EditorLoadingState />}>
          {activeReview ? (
            <FileReviewWorkspace review={activeReview} resolveReview={resolveReview} />
          ) : (
            <section className="pv-artifact-empty"><FileCode2 aria-hidden="true" size={24} /><strong>No artifact selected</strong><span>Open an artifact from a project or completed task to review its changes.</span></section>
          )}
        </Suspense>
      )}

      {activeRoute === 'work' && (
        <section className="pv-work-stage">
          <header className="pv-studio-header">
            <div><span>{t('mode.agent')}</span><strong>{activeSession?.title ?? t('chat.openWorkspace')}</strong></div>
            <div className="pv-stage-tabs">
              <button className={workView === 'plan' ? 'active' : ''} onClick={() => { setWorkView('plan'); selectActivity('plan') }} type="button">{workTabs.plan}</button>
              <button onClick={() => navigate('sessions')} type="button">{workTabs.conversation}</button>
              <button onClick={() => navigate('artifacts')} type="button">{workTabs.artifacts}</button>
              <button aria-label="Context timeline" className={workView === 'timeline' ? 'active' : ''} onClick={() => { setWorkView('timeline'); selectActivity('timeline') }} type="button">{workTabs.runs}</button>
            </div>
          </header>
          {workView === 'overview' ? (
            <WorkCenterWorkspace
              activeSessionId={activeSessionId}
              items={workItems}
              onOpenPlan={openWorkPlan}
              onOpenWorkspace={(sessionId) => {
                const session = sessions.find((candidate) => candidate.id === sessionId)
                if (session) void openSession(session)
              }}
            />
          ) : workView === 'timeline' ? (
            <ContextTimelineWorkspace
              entries={timelineEntries}
              isLoading={isTimelineLoading}
              lastRestore={lastTimelineRestore}
              onOpenReview={openTimelineReview}
              onRestore={restoreFromTimeline}
              onUndo={undoTimelineChange}
              sessionId={activeSessionId}
            />
          ) : (
            <div className="pv-plan-stack">
              <AxisShadowPanel sessionId={activeSessionId} />
              <PlanWorkspace
                approve={approvePlan}
                cancel={cancelPlan}
                execute={executePlan}
                executeNext={executeNextPlanStep}
                generate={generatePlan}
                isBusy={isPlanBusy}
                plan={activePlan}
                sessionId={activeSessionId}
              />
            </div>
          )}
        </section>
      )}

      {activeRoute === 'sessions' && (
        <section className="pv-session-stage">
          <header className="pv-studio-header pv-conversation-header" data-figma-screen="63:190">
            <div><span>{activeSession?.projectPath ? activeSession.projectPath.split(/[\\/]/).at(-1) ?? activeSession.projectPath : t('session.workspace')}</span><b>/</b><strong>{activeSession?.title ?? t('session.new')}</strong></div>
            <button disabled={!activeSessionId} onClick={() => activeSessionId && void exportSessionToClipboard(activeSessionId, 'markdown')} type="button">Share</button>
          </header>
          <div className="pv-workspace-surface">
            {activeSessionView === 'conversation' ? (
              <ChatWorkspace
                activeFilePath={activeFilePath}
                activeSessionId={activeSessionId}
                focusRequest={quickCaptureFocusRequest}
                interactionMode={chatSubmode === 'preview' ? 'agent' : chatSubmode}
                isStreaming={isStreaming}
                messages={messages}
                onAbort={abortMessage}
                onChooseProject={chooseProject}
                onOpenWorkspaceDetails={() => navigate('projects')}
                onSetReasoningEffort={setReasoningEffort}
                reasoningEffort={reasoningEffort}
                sendMessage={sendMessage}
                streamPhase={streamPhase}
              />
            ) : activeSessionView === 'preview' ? (
              <PreviewWorkspace />
            ) : activeSessionView === 'terminal' ? (
              <TerminalWorkspace
                activeTerminalId={activeTerminalId}
                createTerminal={createTerminal}
                destroyTerminal={destroyTerminal}
                projectPath={projectPath}
                resizeActive={resizeActive}
                sessionId={activeSessionId}
                sendToActive={sendToActive}
                setActiveTerminal={setActiveTerminal}
                terminals={terminals}
              />
            ) : (
              <Suspense fallback={<EditorLoadingState />}>
                {activeReview
                  ? <FileReviewWorkspace review={activeReview} resolveReview={resolveReview} />
                  : <EditorWorkspace activeFileContent={activeFileContent} activeFilePath={activeFilePath} />}
              </Suspense>
            )}
          </div>
        </section>
      )}
    </PivotAppShell>
  )

}
