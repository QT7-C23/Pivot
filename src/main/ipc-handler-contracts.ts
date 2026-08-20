import type { ApplicationUpdateState } from '../shared/application-update'
import type { AxisGateCommandRunPort } from './services/axis-gate-runner'
import type { AxisLeaseLifecyclePort } from './services/axis-run-lease-lifecycle'
import type { AxisTaskExecutor } from './services/axis-task-executor'
import type { ProjectCreationPort } from './services/project-creation-port'

export interface IpcRuntimeResources {
  close: () => Promise<void>
  disposeRenderer: (webContentsId: number) => Promise<void>
  ready: Promise<void>
}

export interface UpdateRuntime {
  readonly state: ApplicationUpdateState
  check(): Promise<ApplicationUpdateState>
  download(): Promise<ApplicationUpdateState>
  install(): ApplicationUpdateState
}

export interface AxisGuardedIpcInfrastructure {
  gateCommandRunner?: AxisGateCommandRunPort
  permissionTimeoutMs?: number
  runLifecycle?: AxisLeaseLifecyclePort
}

export interface AxisPivotIpcInfrastructure {
  dryRunExecutor?: AxisTaskExecutor
}

export interface IpcHandlerOptions {
  axisGuarded?: AxisGuardedIpcInfrastructure
  axisPivot?: AxisPivotIpcInfrastructure
  databasePath?: string
  userDataPath?: string
  projectCreation?: ProjectCreationPort
  trace?: (stage: string, detail?: unknown) => void
  trustedRendererUrl?: string
  updates?: UpdateRuntime
}
