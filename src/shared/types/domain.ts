export interface FileTreeEntry {
  name: string
  path: string
  type: 'file' | 'directory'
}

export interface FileSearchEntry {
  name: string
  path: string
  relativePath: string
}

export interface FileCheckpointRecord {
  content: string
  createdAt: string
  filePath: string
  id: string
  sessionId: string
  sha256: string
  sizeBytes: number
}

export interface FileCheckpointRestoreResult {
  checkpointId: string
  filePath: string
  restoredAt: string
  sha256: string
  sizeBytes: number
}

export interface FileSafeWriteResult {
  checkpoint: FileCheckpointRecord | null
  filePath: string
  reviewId?: string
  sha256: string
  sizeBytes: number
  writtenAt: string
}

export type FileReviewDecision = 'pending' | 'accepted' | 'rejected'
export type FileReviewStatus = 'pending' | 'accepted' | 'rejected' | 'mixed'

export interface FileReviewHunk {
  decision: FileReviewDecision
  id: string
  index: number
  modifiedContent: string
  modifiedStart: number
  originalContent: string
  originalStart: number
}

export interface FileReviewRecord {
  checkpointId: string | null
  createdAt: string
  currentContent: string
  filePath: string
  hunks: FileReviewHunk[]
  id: string
  modifiedContent: string
  originalContent: string
  sessionId: string
  status: FileReviewStatus
  updatedAt: string
}

export interface FileReviewResolution {
  decision: 'accept' | 'reject' | 'reset'
  hunkIndex?: number
}

export interface ContextTimelineMessageEntry {
  id: string
  role: ChatMessage['role']
  sessionId: string
  text: string
  timestamp: string
  type: 'message'
}

export interface ContextTimelineFileEntry {
  additions: number
  checkpointId: string | null
  deletions: number
  filePath: string
  id: string
  reviewId: string
  sessionId: string
  status: FileReviewStatus
  timestamp: string
  type: 'file-change'
}

export type ContextTimelineEntry = ContextTimelineMessageEntry | ContextTimelineFileEntry

export interface ContextTimelineRestoreResult {
  action: 'deleted' | 'restored'
  filePath: string
  restoredAt: string
  reviewId: string
  sessionId: string
  undoCheckpointId: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  sessionId: string
  text: string
  timestamp: string
}

export interface AgentRequestContext {
  activeFilePath?: string
  interactionMode?: 'chat' | 'agent' | 'terminal'
  projectPath?: string
  reasoningEffort?: 1 | 2 | 3 | 4 | 5
  referencedFiles?: AgentReferencedFile[]
}

export interface AgentReferencedFile {
  content: string
  filePath: string
}

export type AgentClientContext = Omit<AgentRequestContext, 'projectPath' | 'referencedFiles'> & {
  referencedFilePaths?: string[]
}

export interface AgentAdapterInfo {
  args?: string[]
  command?: string
  id: string
  kind: 'local' | 'cli' | 'http'
  label: string
  profileId?: string
}

export type AgentCliProfileId = 'local' | 'codex' | 'claude' | 'custom'
export type AgentCliMaintenanceAction = 'version' | 'update'

export interface AgentCliCommandSpec {
  args: string[]
  command: string
}

export interface AgentCliCustomProfileConfig {
  adapterArgs: string[]
  adapterCommand?: string
  updateCommand?: AgentCliCommandSpec
  versionCommand?: AgentCliCommandSpec
}

export interface AgentCliProfile {
  adapterArgs: string[]
  adapterCommand?: string
  id: AgentCliProfileId
  isSelected: boolean
  label: string
  updateCommand?: AgentCliCommandSpec
  versionCommand?: AgentCliCommandSpec
}

export interface AgentCliMaintenanceResult {
  action: AgentCliMaintenanceAction
  args: string[]
  command: string
  exitCode: number | null
  output: string
  outputTruncated: boolean
  profileId: AgentCliProfileId
  timedOut: boolean
  unavailable: boolean
}

export interface CommandRunResult {
  args: string[]
  command: string
  cwd: string
  exitCode: number | null
  finishedAt: string
  outputTruncated: boolean
  stderr: string
  stdout: string
  timedOut: boolean
  timeoutMs: number
  startedAt: string
}

export type PermissionBehavior = 'allow' | 'deny'
export type PermissionDecision = PermissionBehavior | 'allow_session'

export interface PermissionRequest {
  input: Record<string, unknown>
  requestId: string
  runId: string
  sessionId: string
  toolName: string
}

export interface SessionRecord {
  id: string
  title: string
  projectPath: string
  status: 'active' | 'idle' | 'archived'
  isPinned: boolean
  isFavorite: boolean
  isUnread: boolean
  tags: string[]
  groupId: string | null
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface SessionGroupRecord {
  createdAt: string
  id: string
  name: string
  parentId: string | null
}

export interface SessionMetadataPatch {
  groupId?: string | null
  isFavorite?: boolean
  isUnread?: boolean
  status?: SessionRecord['status']
  tags?: string[]
  title?: string
}

export type PlanStatus = 'draft' | 'ready' | 'executing' | 'paused' | 'done' | 'cancelled'
export type PlanExecutionMode = 'auto' | 'step' | 'selective'
export type PlanStepStatus = 'pending' | 'running' | 'done' | 'skipped' | 'error'

export interface PlanStep {
  description: string
  id: string
  order: number
  selected: boolean
  status: PlanStepStatus
  targets: string[]
  title: string
}

export interface PlanDocument {
  createdAt: string
  executionMode: PlanExecutionMode | null
  id: string
  sessionId: string
  source: string
  status: PlanStatus
  steps: PlanStep[]
  title: string
  updatedAt: string
  version: number
}

export interface PlanDraftInput {
  source: string
  steps: Array<Pick<PlanStep, 'description' | 'targets' | 'title'>>
  title: string
}

// ── Unified work model (UI V2 migration contract) ────────────

export type StudioKind = 'chat' | 'document' | 'slide' | 'code' | 'image' | 'video' | 'data' | 'browser' | 'automation'

export type TaskLifecycleStatus =
  | 'draft'
  | 'plan_ready'
  | 'queued'
  | 'running_local'
  | 'running_remote'
  | 'background'
  | 'paused'
  | 'waiting_permission'
  | 'waiting_question'
  | 'failed_recoverable'
  | 'failed_terminal'
  | 'review_ready'
  | 'delivered'
  | 'cancelled'

export type RunLifecycleStatus = 'queued' | 'running' | 'paused' | 'waiting' | 'failed' | 'completed' | 'cancelled'
export type ArtifactType = 'document' | 'slide' | 'code-change' | 'webpage' | 'image' | 'video' | 'dataset' | 'other'
export type ArtifactLifecycleStatus = 'draft' | 'generating' | 'review_ready' | 'accepted' | 'changes_requested' | 'rejected'
export type ArtifactReviewLifecycleStatus = 'pending' | 'accepted' | 'changes_requested' | 'rejected'
export type AttentionKind = 'permission' | 'question' | 'failure' | 'review'

export interface TaskRecord {
  createdAt: string
  id: string
  planId: string | null
  projectPath: string
  sessionId: string
  status: TaskLifecycleStatus
  studio: StudioKind
  title: string
  updatedAt: string
}

export interface RunRecord {
  completedSteps: number
  id: string
  location: 'local' | 'remote'
  runtimeId: string
  runtimeLabel: string
  sessionId: string
  status: RunLifecycleStatus
  taskId: string
  totalSteps: number
  updatedAt: string
}

export interface ArtifactRecord {
  id: string
  path?: string
  sessionId: string
  status: ArtifactLifecycleStatus
  taskId: string
  title: string
  type: ArtifactType
  updatedAt: string
}

export interface ArtifactReviewRecord {
  artifactId: string
  id: string
  sessionId: string
  status: ArtifactReviewLifecycleStatus
  taskId: string
  updatedAt: string
}

export interface AttentionItem {
  createdAt: string
  detail: string
  id: string
  kind: AttentionKind
  priority: 'normal' | 'high'
  runId: string | null
  sessionId: string
  taskId: string
  title: string
}

export interface WorkItemSnapshot {
  artifacts: ArtifactRecord[]
  attention: AttentionItem[]
  reviews: ArtifactReviewRecord[]
  run: RunRecord | null
  task: TaskRecord
}

export type ProviderKind = 'anthropic' | 'openai' | 'deepseek' | 'glm' | 'qwen' | 'kimi' | 'custom'

export interface ProviderConfig {
  baseUrl: string
  hasApiKey: boolean
  id: string
  isActive: boolean
  kind: ProviderKind
  label: string
  model: string
  updatedAt: string
}

export interface ProviderConfigInput {
  apiKey?: string
  baseUrl: string
  id: string
  kind: ProviderKind
  label: string
  model: string
}

export interface ProviderConnectionResult {
  latencyMs: number
  message: string
  ok: boolean
  status: number | null
}

export interface ProjectHistoryEntry {
  lastOpenedAt: string
  path: string
  title: string
}

// ── .agent.md Manifest Schema ──────────────────────────

/** Frontmatter trigger definition for .agent.md files (v0.1) */
export interface AgentTrigger {
  /** Trigger on slash commands like /research */
  on_command?: string[]
  /** Trigger on file changes matching a pattern */
  on_code_change?: {
    filePattern: string
    changeType: ('added' | 'modified' | 'deleted')[]
  }
  /** Trigger before or after a specific tool call */
  on_tool_call?: {
    toolName: string
    phase: 'before' | 'after'
  }
}

/**
 * Parsed frontmatter from a .agent.md file (v0.1 schema).
 * Extended in v1.0 with workers, DAG, MCP, quality gates.
 */
export interface AgentManifest {
  name: string
  version: string
  description: string
  /** Recommended model ID (e.g. claude-sonnet-4-5) */
  model?: string
  /** Tool whitelist */
  tools?: string[]
  /** Event triggers */
  triggers?: AgentTrigger[]
}
