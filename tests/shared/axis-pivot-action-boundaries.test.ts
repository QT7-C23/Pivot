import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Axis Pivot action dependency boundaries', () => {
  it('keeps Pivot action handlers on narrow Ports without infrastructure or Renderer imports', async () => {
    const handler = await readFile(path.resolve(
      'src/main/services/axis-pivot-replan-action-handler.ts',
    ), 'utf8')
    const retryHandler = await readFile(path.resolve(
      'src/main/services/axis-pivot-retry-action-handler.ts',
    ), 'utf8')
    const selfRepairHandler = await readFile(path.resolve(
      'src/main/services/axis-pivot-self-repair-action-handler.ts',
    ), 'utf8')
    const dedicatedFixerHandler = await readFile(path.resolve(
      'src/main/services/axis-pivot-dedicated-fixer-action-handler.ts',
    ), 'utf8')
    const discardHandler = await readFile(path.resolve(
      'src/main/services/axis-pivot-discard-action-handler.ts',
    ), 'utf8')
    const discardPorts = await readFile(path.resolve(
      'src/main/services/axis-worker-discard-ports.ts',
    ), 'utf8')
    const discardRegistry = await readFile(path.resolve(
      'src/main/services/axis-worker-discard-registry.ts',
    ), 'utf8')
    const discardContracts = await readFile(path.resolve(
      'src/shared/axis-worker-discard-contracts.ts',
    ), 'utf8')
    const escalateHandler = await readFile(path.resolve(
      'src/main/services/axis-pivot-escalate-action-handler.ts',
    ), 'utf8')
    const stopHandler = await readFile(path.resolve(
      'src/main/services/axis-pivot-stop-action-handler.ts',
    ), 'utf8')
    const dispatcher = await readFile(path.resolve(
      'src/main/services/axis-pivot-action-dispatcher.ts',
    ), 'utf8')
    const dispatcherPorts = await readFile(path.resolve(
      'src/main/services/axis-pivot-dispatch-ports.ts',
    ), 'utf8')
    const composition = await readFile(path.resolve(
      'src/main/services/axis-pivot-action-composition.ts',
    ), 'utf8')
    const productionRuntime = await readFile(path.resolve(
      'src/main/services/axis-production-pivot-runtime.ts',
    ), 'utf8')
    const escalationPorts = await readFile(path.resolve(
      'src/main/services/axis-human-escalation-ports.ts',
    ), 'utf8')
    const escalationRegistry = await readFile(path.resolve(
      'src/main/services/axis-human-escalation-registry.ts',
    ), 'utf8')
    const escalationContracts = await readFile(path.resolve(
      'src/shared/axis-human-escalation-contracts.ts',
    ), 'utf8')
    const dedicatedFixerPorts = await readFile(path.resolve(
      'src/main/services/axis-dedicated-fixer-ports.ts',
    ), 'utf8')
    const dedicatedFixerRegistry = await readFile(path.resolve(
      'src/main/services/axis-dedicated-fixer-assignment-registry.ts',
    ), 'utf8')
    const dedicatedFixerResolver = await readFile(path.resolve(
      'src/main/services/axis-security-fixer-resolver-adapter.ts',
    ), 'utf8')
    const dedicatedFixerContracts = await readFile(path.resolve(
      'src/shared/axis-dedicated-fixer-contracts.ts',
    ), 'utf8')
    const workerAttemptPorts = await readFile(path.resolve(
      'src/main/services/axis-worker-attempt-ports.ts',
    ), 'utf8')
    const workerAttemptRegistry = await readFile(path.resolve(
      'src/main/services/axis-worker-attempt-registry.ts',
    ), 'utf8')
    const workerAttemptContracts = await readFile(path.resolve(
      'src/shared/axis-worker-attempt-contracts.ts',
    ), 'utf8')
    const ports = await readFile(path.resolve(
      'src/main/services/axis-pivot-action-ports.ts',
    ), 'utf8')
    const runStateRegistry = await readFile(path.resolve(
      'src/main/services/axis-run-state-registry.ts',
    ), 'utf8')
    const adapter = await readFile(path.resolve(
      'src/main/services/axis-pivot-planning-context-adapter.ts',
    ), 'utf8')
    const shared = await readFile(path.resolve(
      'src/shared/axis-pivot-action-contracts.ts',
    ), 'utf8')

    expect(handler).not.toMatch(/better-sqlite3|node:fs|axis-replan-coordinator|axis-pivot-decision-registry|axis-run-state-registry/)
    expect(handler).not.toMatch(/renderer|ipc-handlers/)
    expect(retryHandler).not.toMatch(/better-sqlite3|node:fs|axis-run-state-registry|axis-pivot-decision-registry/)
    expect(retryHandler).not.toMatch(/renderer|worker|ipc-handlers|command|checkpoint|file-writer/)
    expect(selfRepairHandler).not.toMatch(/better-sqlite3|node:fs|axis-run-state-registry|axis-pivot-decision-registry|axis-worker-attempt-registry/)
    expect(selfRepairHandler).not.toMatch(/renderer|ipc-handlers|command|checkpoint|file-writer|executor|safe-write/)
    expect(dedicatedFixerHandler).not.toMatch(/better-sqlite3|node:fs|axis-run-state-registry|axis-pivot-decision-registry|axis-worker-attempt-registry|axis-dedicated-fixer-assignment-registry/)
    expect(dedicatedFixerHandler).not.toMatch(/renderer|ipc-handlers|command|checkpoint|file-writer|executor|safe-write/)
    expect(discardHandler).not.toMatch(/better-sqlite3|node:fs|axis-run-state-registry|axis-pivot-decision-registry|axis-worker-attempt-registry|axis-worker-discard-registry/)
    expect(discardHandler).not.toMatch(/renderer|ipc-handlers|command|checkpoint|file-writer|executor|safe-write/)
    expect(discardPorts).not.toMatch(/better-sqlite3|node:fs|renderer|ipcMain|BrowserWindow/)
    expect(discardRegistry).toContain("from './axis-worker-discard-ports'")
    expect(discardRegistry).not.toMatch(/renderer|ipcMain|BrowserWindow|command|checkpoint|file-writer|executor|safe-write/)
    expect(discardContracts).not.toMatch(/\/main\/|\/renderer\/|better-sqlite3|node:fs/)
    expect(escalateHandler).not.toMatch(/better-sqlite3|node:fs|axis-run-state-registry|axis-pivot-decision-registry|axis-human-escalation-registry/)
    expect(escalateHandler).not.toMatch(/renderer|ipc-handlers|command|checkpoint|file-writer|executor|safe-write/)
    expect(escalationPorts).not.toMatch(/better-sqlite3|node:fs|renderer|ipcMain|BrowserWindow/)
    expect(escalationRegistry).toContain("from './axis-human-escalation-ports'")
    expect(escalationRegistry).not.toMatch(/renderer|ipcMain|BrowserWindow|command|checkpoint|file-writer|executor|safe-write/)
    expect(escalationContracts).not.toMatch(/\/main\/|\/renderer\/|better-sqlite3|node:fs/)
    expect(stopHandler).not.toMatch(/better-sqlite3|node:fs|axis-run-state-registry|axis-pivot-decision-registry/)
    expect(stopHandler).not.toMatch(/renderer|ipc-handlers|command|checkpoint|file-writer|executor|safe-write|worker/)
    expect(dispatcher).toContain("from './axis-pivot-dispatch-ports'")
    expect(dispatcher).not.toMatch(/better-sqlite3|node:fs|renderer|ipc-handlers/)
    expect(dispatcher).not.toMatch(/command|checkpoint|file-writer|safe-write|worker|execution-authority/)
    expect(dispatcher).not.toMatch(/axis-pivot-(replan|retry|self-repair|dedicated-fixer|discard|escalate|stop)-action-handler/)
    expect(dispatcherPorts).not.toMatch(/better-sqlite3|node:fs|renderer|ipcMain|BrowserWindow/)
    expect(composition).not.toMatch(/better-sqlite3|node:fs|renderer|ipc-handlers/)
    expect(composition).not.toMatch(/command|checkpoint|file-writer|safe-write|worker|execution-authority/)
    expect(composition).not.toMatch(/axis-pivot-(replan|retry|self-repair|dedicated-fixer|discard|escalate|stop)-action-handler/)
    expect(productionRuntime).toMatch(/AxisPivotReplanActionHandler/)
    expect(productionRuntime).toMatch(/AxisPivotRetryActionHandler/)
    expect(productionRuntime).toMatch(/AxisPivotSelfRepairActionHandler/)
    expect(productionRuntime).toMatch(/AxisPivotDedicatedFixerActionHandler/)
    expect(productionRuntime).toMatch(/AxisPivotDiscardActionHandler/)
    expect(productionRuntime).toMatch(/AxisPivotEscalateActionHandler/)
    expect(productionRuntime).toMatch(/AxisPivotStopActionHandler/)
    expect(productionRuntime).not.toMatch(/renderer|ipc-handlers|BrowserWindow|ipcMain/)
    expect(productionRuntime).not.toMatch(/command|checkpoint|file-writer|safe-write|execution-authority/)
    expect(dedicatedFixerPorts).not.toMatch(/better-sqlite3|node:fs|renderer|ipcMain|BrowserWindow/)
    expect(dedicatedFixerRegistry).toContain("from './axis-dedicated-fixer-ports'")
    expect(dedicatedFixerRegistry).not.toMatch(/renderer|ipcMain|BrowserWindow|command|checkpoint|file-writer|executor|safe-write/)
    expect(dedicatedFixerResolver).not.toMatch(/better-sqlite3|node:fs|renderer|ipcMain|BrowserWindow|command|checkpoint|file-writer|executor|safe-write/)
    expect(dedicatedFixerContracts).not.toMatch(/\/main\/|\/renderer\/|better-sqlite3|node:fs/)
    expect(ports).not.toMatch(/better-sqlite3|node:fs|renderer/)
    expect(ports).toMatch(/interface AxisPivotAssignmentStatePort/)
    expect(ports).toMatch(/scheduleAssignment/)
    expect(runStateRegistry).toMatch(/openPivotAssignmentStatePort/)
    expect(selfRepairHandler).toContain("from './axis-pivot-action-ports'")
    expect(dedicatedFixerHandler).toContain("from './axis-pivot-action-ports'")
    expect(workerAttemptPorts).not.toMatch(/better-sqlite3|node:fs|renderer|ipcMain|BrowserWindow/)
    expect(workerAttemptRegistry).toContain("from './axis-worker-attempt-ports'")
    expect(workerAttemptRegistry).not.toMatch(/renderer|ipcMain|BrowserWindow|command|checkpoint|file-writer|executor|safe-write/)
    expect(workerAttemptContracts).not.toMatch(/\/main\/|\/renderer\/|better-sqlite3|node:fs/)
    expect(adapter).not.toMatch(/better-sqlite3|node:fs|renderer|ipc-handlers/)
    expect(shared).not.toMatch(/\/main\/|\/renderer\//)
  })
})
