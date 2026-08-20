import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve('src/renderer')

describe('Axis Shadow work center', () => {
  it('uses a typed store and explicit opt-in service channels', () => {
    const service = read('services/axis-shadow.service.ts')
    const store = read('stores/axis-shadow.store.ts')
    expect(service).toContain("'axis:shadow-state'")
    expect(service).toContain("'axis:set-shadow-enabled'")
    expect(service).toContain("'axis:plan-shadow'")
    expect(service).toContain("'axis:list-shadow-runs'")
    expect(service).toContain("'axis:list-run-states'")
    expect(service).toContain("'axis:cancel-run'")
    expect(service).toContain("'axis:restart-run'")
    expect(service).toContain("'axis:dry-run-state'")
    expect(service).toContain("'axis:set-dry-run-enabled'")
    expect(service).toContain("'axis:execute-dry-run'")
    expect(service).toContain("'axis:guarded-safe-write-state'")
    expect(service).toContain("'axis:execute-guarded-safe-write'")
    expect(store).toContain('AxisShadowRunResult')
    expect(store).toContain('AxisRunState')
  })

  it('surfaces persisted plans with an explicit guarded approval boundary', () => {
    const panel = read('components/axis-shadow-panel.tsx')
    const approval = read('components/axis-guarded-write-approval.tsx')
    const app = read('pivot-app.tsx')
    expect(app).toContain('<AxisShadowPanel')
    expect(panel).toContain('AxisGuardedWriteApproval')
    expect(panel).toContain('orderedTaskIds')
    expect(panel).toContain('activeRunState')
    expect(panel).toContain('executeDryRun')
    expect(panel).toContain('qualityAuditEvents')
    expect(panel).toContain('gateCyclesForFile')
    expect(panel).toContain('retriesForTask')
    expect(panel).toContain('guardedCompletionEvidence')
    expect(panel).toContain('transactionRevision')
    expect(panel).toContain('gateEvidenceIds')
    expect(panel).toContain("runs.length === 0")
    expect(panel).toContain("' compact'")
    expect(panel).not.toMatch(/executePlan|executeNext|term:run|fs:safe-write/)
    expect(approval).toContain('executeGuardedSafeWrite')
    expect(approval).toContain('assignedFiles')
    expect(approval).not.toMatch(/projectRoot|grantedTools|authority|window\.pivot/)
    expect(panel).not.toMatch(/AxisExecutionTransactionPort|better-sqlite3|node:fs/)
  })

  it('keeps permission decisions globally reachable while the Work route is active', () => {
    const app = read('pivot-app.tsx')
    const agentPanel = read('components/agent-status-panel.tsx')
    expect(app).toContain('<PermissionDialogQueue')
    expect(agentPanel).toContain('export function PermissionDialogQueue')
    expect(agentPanel).not.toContain('<PermissionDialogQueue requests={permissionRequests}')
  })

  it('places the default-off switch in Agent settings', () => {
    const settings = read('components/settings-navigation-workspace.tsx')
    expect(settings).toContain('axis-shadow-card')
    expect(settings).toContain('setShadowEnabled')
    expect(settings).toContain('Shadow planning is off by default')
    expect(settings).toContain('Dry-run execution is independently off by default')
  })
})

function read(relativePath: string): string {
  return readFileSync(path.join(root, relativePath), 'utf8')
}
