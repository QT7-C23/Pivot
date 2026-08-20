import { expect, test, type Page } from '@playwright/test'
import { _electron as electron, type ElectronApplication } from 'playwright'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'

const appRoot = path.resolve('.')

test('model proposal reaches read-only Diff Review before guarded approval and rollback', async () => {
  test.setTimeout(90_000)
  const targetRoot = path.join(appRoot, '.tmp', `playwright-guarded-${process.pid}-${Date.now()}`)
  const targetPath = path.join(targetRoot, 'target.ts')
  const assignedFile = 'target.ts'
  await mkdir(targetRoot, { recursive: true })
  await writeFile(path.join(targetRoot, 'tsconfig.json'), JSON.stringify({
    compilerOptions: {
      noEmit: true,
      skipLibCheck: true,
      strict: true,
      target: 'ES2022',
    },
    files: [assignedFile],
  }))
  await writeFile(
    path.join(targetRoot, 'vitest.config.ts'),
    'export default { test: { passWithNoTests: true } }\n',
  )
  await writeFile(targetPath, 'export const guardedValue = 1\n')
  const provider = await startAxisProviderServer(assignedFile)
  const fixture = await launchFixture('guarded-approval', {
    env: { PIVOT_AXIS_REAL_EXECUTION: '1' },
    projectRoot: targetRoot,
  })
  try {
    const session = await createSession(fixture.page, fixture.projectRoot)
    await fixture.page.reload()
    await expect(fixture.page.locator('main')).toBeVisible()
    await expect(fixture.page.locator('[data-route="work"]')).toBeEnabled()
    await fixture.page.evaluate(async ({ baseUrl }) => {
      await window.pivot.invoke('provider:save', {
        apiKey: 'e2e-secret',
        baseUrl,
        id: 'axis-e2e',
        kind: 'custom',
        label: 'Axis E2E',
        model: 'axis-e2e-model',
      })
      await window.pivot.invoke('provider:set-active', { id: 'axis-e2e' })
      await window.pivot.invoke('axis:set-shadow-enabled', { enabled: true })
    }, { baseUrl: provider.baseUrl })

    await fixture.page.locator('[data-route="work"]').click()
    const panel = fixture.page.locator('.pv-axis-shadow-panel')
    await expect(panel).toBeVisible()
    await panel.locator('.pv-axis-shadow-create textarea').fill('Guarded approval E2E')
    await panel.locator('.pv-axis-shadow-create button').click()

    const approval = panel.locator('.pv-axis-guarded-approval')
    await expect(approval).toBeVisible({ timeout: 20_000 })
    await approval.locator('.pv-axis-proposal-button').click()
    await expect(approval.locator('.pv-axis-proposal-review')).toBeVisible({
      timeout: 20_000,
    })
    await expect(approval.locator('textarea')).toHaveValue(
      'export const guardedValue: = 2\n',
    )
    await approval.locator('input[type="checkbox"]').check()
    await approval.getByRole('button', {
      name: /批准受保护写入|Approve guarded write/,
    }).click()

    const permission = fixture.page.locator('.permission-dialog')
    await expect.poll(async () => {
      if (await permission.isVisible()) return 'permission'
      const states = await fixture.page.evaluate(
        (sessionId) => window.pivot.invoke('axis:list-run-states', { sessionId }),
        session.id,
      )
      const task = states[0]?.tasks.find((candidate) => candidate.taskId === 'write')
      return task?.error ?? task?.status ?? 'missing'
    }).toBe('permission')
    await permission.locator('.primary-button').click()

    await expect(approval).toBeHidden({ timeout: 90_000 })
    await expect(panel.locator('.pv-axis-shadow-metrics')).toContainText('failed')
    expect(await readFile(targetPath, 'utf8')).toBe('export const guardedValue = 1\n')
  } finally {
    await fixture.close()
    await provider.close()
    await rm(targetRoot, { force: true, recursive: true })
  }
})

test('successful guarded write exposes durable completion evidence after the production Gate', async () => {
  test.setTimeout(90_000)
  const targetRoot = path.join(appRoot, '.tmp', `playwright-guarded-success-${process.pid}-${Date.now()}`)
  const targetPath = path.join(targetRoot, 'target.ts')
  const assignedFile = 'target.ts'
  const proposedContent = 'export const guardedValue = 2\n'
  await mkdir(targetRoot, { recursive: true })
  await writeFile(path.join(targetRoot, 'tsconfig.json'), JSON.stringify({
    compilerOptions: {
      noEmit: true,
      skipLibCheck: true,
      strict: true,
      target: 'ES2022',
    },
    files: [assignedFile],
  }))
  await writeFile(
    path.join(targetRoot, 'vitest.config.ts'),
    'export default { test: { passWithNoTests: true } }\n',
  )
  await writeFile(targetPath, 'export const guardedValue = 1\n')
  const provider = await startAxisProviderServer(assignedFile, proposedContent)
  const fixture = await launchFixture('guarded-success', {
    env: { PIVOT_AXIS_REAL_EXECUTION: '1' },
    projectRoot: targetRoot,
  })
  try {
    const session = await createSession(fixture.page, fixture.projectRoot)
    await fixture.page.reload()
    await expect(fixture.page.locator('main')).toBeVisible()
    await fixture.page.evaluate(async ({ baseUrl }) => {
      await window.pivot.invoke('provider:save', {
        apiKey: 'e2e-secret',
        baseUrl,
        id: 'axis-e2e',
        kind: 'custom',
        label: 'Axis E2E',
        model: 'axis-e2e-model',
      })
      await window.pivot.invoke('provider:set-active', { id: 'axis-e2e' })
      await window.pivot.invoke('axis:set-shadow-enabled', { enabled: true })
    }, { baseUrl: provider.baseUrl })

    await fixture.page.locator('[data-route="work"]').click()
    const panel = fixture.page.locator('.pv-axis-shadow-panel')
    await panel.locator('.pv-axis-shadow-create textarea').fill('Guarded approval E2E')
    await panel.locator('.pv-axis-shadow-create button').click()

    const approval = panel.locator('.pv-axis-guarded-approval')
    await expect(approval).toBeVisible({ timeout: 20_000 })
    await approval.locator('.pv-axis-proposal-button').click()
    await expect(approval.locator('.pv-axis-proposal-review')).toBeVisible({
      timeout: 20_000,
    })
    await expect(approval.locator('textarea')).toHaveValue(proposedContent)
    await approval.locator('input[type="checkbox"]').check()
    await approval.getByRole('button', {
      name: /批准受保护写入|Approve guarded write/,
    }).click()

    const permission = fixture.page.locator('.permission-dialog')
    await expect(permission).toBeVisible({ timeout: 20_000 })
    await permission.locator('.primary-button').click()

    await expect(approval).toBeHidden({ timeout: 90_000 })
    const userDataPath = await fixture.app.evaluate(({ app }) => app.getPath('userData'))
    const evidenceDb = new Database(path.join(userDataPath, 'pivot.sqlite'), {
      readonly: true,
    })
    const gateEvidence = (evidenceDb.prepare(
      'SELECT evidence_json FROM axis_gate_evidence ORDER BY recorded_at ASC',
    ).all() as Array<{ evidence_json: string }>).map(
      ({ evidence_json }) => JSON.parse(evidence_json) as {
        gate: string
        status: string
        stderr: string
        stdout: string
      },
    )
    evidenceDb.close()
    expect(gateEvidence).toMatchObject([
      { gate: 'compile', status: 'passed' },
      { gate: 'test', status: 'passed' },
    ])
    await expect.poll(async () => {
      const states = await fixture.page.evaluate(
        (sessionId) => window.pivot.invoke('axis:list-run-states', { sessionId }),
        session.id,
      )
      const state = states[0]
      const task = state?.tasks.find((candidate) => candidate.taskId === 'write')
      return {
        error: task?.error,
        run: state?.status,
        task: task?.status,
      }
    }).toEqual({ error: null, run: 'completed', task: 'completed' })
    await expect(panel.locator('.pv-axis-shadow-metrics')).toContainText('completed')
    const completion = panel.locator('.pv-axis-guarded-completion')
    await expect(completion).toBeVisible()
    await expect(completion).toContainText(/Durable completion|持久完成证据/)
    await expect(completion).toContainText(/transaction r3|事务 r3/)
    expect(await readFile(targetPath, 'utf8')).toBe(proposedContent)
  } finally {
    await fixture.close()
    await provider.close()
    await rm(targetRoot, { force: true, recursive: true })
  }
})

test('externally changed reviewed proposal is rejected before permission and task claim', async () => {
  test.setTimeout(90_000)
  const targetRoot = path.join(appRoot, '.tmp', `playwright-stale-review-${process.pid}-${Date.now()}`)
  const targetPath = path.join(targetRoot, 'target.ts')
  const assignedFile = 'target.ts'
  await mkdir(targetRoot, { recursive: true })
  await writeFile(path.join(targetRoot, 'tsconfig.json'), JSON.stringify({
    compilerOptions: {
      noEmit: true,
      strict: true,
      target: 'ES2022',
    },
    files: [assignedFile],
  }))
  await writeFile(targetPath, 'export const guardedValue = 1\n')
  const provider = await startAxisProviderServer(assignedFile)
  const fixture = await launchFixture('stale-guarded-review', {
    env: { PIVOT_AXIS_REAL_EXECUTION: '1' },
    projectRoot: targetRoot,
  })
  try {
    const session = await createSession(fixture.page, fixture.projectRoot)
    await fixture.page.reload()
    await expect(fixture.page.locator('main')).toBeVisible()
    await fixture.page.evaluate(async ({ baseUrl }) => {
      await window.pivot.invoke('provider:save', {
        apiKey: 'e2e-secret',
        baseUrl,
        id: 'axis-e2e',
        kind: 'custom',
        label: 'Axis E2E',
        model: 'axis-e2e-model',
      })
      await window.pivot.invoke('provider:set-active', { id: 'axis-e2e' })
      await window.pivot.invoke('axis:set-shadow-enabled', { enabled: true })
    }, { baseUrl: provider.baseUrl })

    await fixture.page.locator('[data-route="work"]').click()
    const panel = fixture.page.locator('.pv-axis-shadow-panel')
    await panel.locator('.pv-axis-shadow-create textarea').fill('Guarded approval E2E')
    await panel.locator('.pv-axis-shadow-create button').click()

    const approval = panel.locator('.pv-axis-guarded-approval')
    await expect(approval).toBeVisible({ timeout: 20_000 })
    await approval.locator('.pv-axis-proposal-button').click()
    await expect(approval.locator('.pv-axis-proposal-review')).toBeVisible({
      timeout: 20_000,
    })
    await writeFile(targetPath, 'export const externallyChanged = 99\n')
    await approval.locator('input[type="checkbox"]').check()
    await approval.getByRole('button', {
      name: /批准受保护写入|Approve guarded write/,
    }).click()

    await expect(panel.locator('.pv-axis-shadow-error')).toContainText(
      /baseline changed before submission/i,
      { timeout: 20_000 },
    )
    await expect(fixture.page.locator('.permission-dialog')).toBeHidden()
    await expect.poll(async () => {
      const states = await fixture.page.evaluate(
        (sessionId) => window.pivot.invoke('axis:list-run-states', { sessionId }),
        session.id,
      )
      const state = states[0]
      const task = state?.tasks.find((candidate) => candidate.taskId === 'write')
      return {
        revision: state?.revision,
        run: state?.status,
        task: task?.status,
      }
    }).toEqual({ revision: 2, run: 'planned', task: 'pending' })
    expect(await readFile(targetPath, 'utf8')).toBe('export const externallyChanged = 99\n')
  } finally {
    await fixture.close()
    await provider.close()
    await rm(targetRoot, { force: true, recursive: true })
  }
})

test('conversation sends a prompt and renders the streamed assistant response', async () => {
  const fixture = await launchFixture('chat')
  try {
    await createSessionAndReload(fixture.page, fixture.projectRoot)
    const composer = fixture.page.locator('.chat-composer textarea')
    await composer.fill('Explain the Pivot runtime')
    await composer.press('Enter')

    await expect(fixture.page.locator('.chat-message.user')).toContainText('Explain the Pivot runtime')
    await expect(fixture.page.locator('.chat-message.assistant')).toContainText('Pivot local runtime received your request.')
  } finally {
    await fixture.close()
  }
})

test('legacy arbitrary Renderer safe-write IPC is unavailable', async () => {
  const fixture = await launchFixture('no-renderer-safe-write')
  try {
    const session = await createSession(fixture.page, fixture.projectRoot)
    const result = await fixture.page.evaluate(
      async ({ filePath, sessionId }) => {
        try {
          const invoke = window.pivot.invoke as (
            channel: string,
            request: unknown,
          ) => Promise<unknown>
          await invoke('fs:safe-write', {
            content: 'export const value = 2\n',
            filePath,
            sessionId,
          })
          return 'unexpected-success'
        } catch (error) {
          return error instanceof Error ? error.message : String(error)
        }
      },
      { filePath: path.join(fixture.projectRoot, 'example.ts'), sessionId: session.id },
    )
    expect(result).toMatch(/no handler registered|unknown ipc|not registered/i)
  } finally {
    await fixture.close()
  }
})

test('decision surfaces reveal a restrained pointer spotlight', async () => {
  const fixture = await launchFixture('spotlight')
  try {
    await fixture.page.evaluate(() => localStorage.removeItem('pivot:onboarding-complete'))
    await fixture.page.reload()
    const welcomeCard = fixture.page.locator('.welcome-mode-card').first()
    await expect(welcomeCard).toBeVisible()
    await welcomeCard.hover({ position: { x: 120, y: 64 } })
    await expect.poll(() => welcomeCard.evaluate((element) => element.style.getPropertyValue('--spotlight-opacity'))).toBe('1')
    await expect.poll(() => welcomeCard.evaluate((element) => Math.abs(Number.parseFloat(element.style.getPropertyValue('--spotlight-x')) - 120) < 1)).toBe(true)

    await fixture.page.locator('.welcome-shortcuts button').first().click()
    const providerCard = fixture.page.locator('.provider-catalog .spotlight-surface').first()
    await expect(providerCard).toBeVisible()
    await providerCard.hover({ position: { x: 80, y: 32 } })
    await expect.poll(() => providerCard.evaluate((element) => element.style.getPropertyValue('--spotlight-opacity'))).toBe('1')
    await expect.poll(() => providerCard.evaluate((element) => Math.abs(Number.parseFloat(element.style.getPropertyValue('--spotlight-x')) - 80) < 1)).toBe(true)
  } finally {
    await fixture.close()
  }
})

test('plugin settings exposes the all-free ecosystem contract', async () => {
  const fixture = await launchFixture('free-plugins')
  try {
    await fixture.page.locator('.title-icon').click()
    await fixture.page.locator('.settings-navigation button').nth(7).click()

    const policy = fixture.page.locator('.plugin-policy-card')
    await expect(policy).toBeVisible()
    await expect(policy).toContainText('全部免费')
    await expect(policy).toContainText('免费社区目录')
    await expect(policy.locator('button')).toHaveCount(0)
  } finally {
    await fixture.close()
  }
})

test('application update settings stay honest without a release channel', async () => {
  const fixture = await launchFixture('updates-unavailable')
  try {
    await fixture.page.locator('.title-icon').click()
    await fixture.page.locator('.settings-navigation button').nth(9).click()

    const updateCard = fixture.page.locator('.update-status-card')
    await expect(updateCard).toHaveClass(/status-unavailable/)
    await expect(updateCard).toContainText('发布通道未配置')
    await expect(updateCard.getByRole('button', { name: '检查更新' })).toBeDisabled()
  } finally {
    await fixture.close()
  }
})

test('Preview loads a local development page and switches device viewport', async () => {
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    response.end('<!doctype html><title>Pivot Preview Fixture</title><main>Preview ready</main>')
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address() as AddressInfo
  const previewUrl = `http://127.0.0.1:${address.port}/`
  const fixture = await launchFixture('preview')
  try {
    await fixture.page.reload()
    await fixture.page.getByRole('button', { name: '预览', exact: true }).click()
    const preview = fixture.page.locator('.preview-workspace')
    await expect(preview).toBeVisible()
    await preview.getByRole('textbox', { name: '预览地址' }).fill(previewUrl)
    await preview.getByRole('button', { name: '打开', exact: true }).click()
    await expect.poll(() => preview.locator('webview').evaluate((element) => (element as Electron.WebviewTag).getURL())).toBe(previewUrl)

    await preview.getByRole('button', { name: '手机' }).click()
    await expect.poll(() => preview.locator('.preview-frame-shell').evaluate((element) => Math.round(element.getBoundingClientRect().width))).toBeLessThanOrEqual(390)
  } finally {
    await fixture.close()
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
})

async function launchFixture(name: string, options: {
  env?: Record<string, string>
  projectRoot?: string
} = {}): Promise<{
  app: ElectronApplication
  close(): Promise<void>
  page: Page
  projectRoot: string
}> {
  const root = path.join(os.tmpdir(), `pivot-playwright-${name}-${process.pid}-${Date.now()}`)
  const projectRoot = options.projectRoot ?? path.join(root, 'project')
  const userDataPath = path.join(root, 'user-data')
  await mkdir(projectRoot, { recursive: true })
  const app = await electron.launch({
    args: ['--no-sandbox', '--disable-gpu', '.'],
    cwd: appRoot,
    env: normalizedEnvironment({
      PIVOT_DISABLE_HARDWARE_ACCELERATION: '1',
      PIVOT_E2E_USER_DATA: userDataPath,
      ...options.env,
    }),
  })
  const page = await app.firstWindow()
  await app.evaluate(({ dialog }, selectedPath) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selectedPath] })
  }, projectRoot)
  await page.evaluate(() => localStorage.setItem('pivot:onboarding-complete', '1'))
  return {
    app,
    page,
    projectRoot,
    async close() {
      await app.close().catch(() => undefined)
      await rm(root, { force: true, recursive: true })
    },
  }
}

async function startAxisProviderServer(
  assignedFile: string,
  proposedContent = 'export const guardedValue: = 2\n',
): Promise<{
  baseUrl: string
  close(): Promise<void>
}> {
  const server = createServer(async (request, response) => {
    if (request.method !== 'POST' || request.url !== '/v1/chat/completions') {
      response.writeHead(404).end()
      return
    }
    const chunks: Buffer[] = []
    for await (const chunk of request) chunks.push(Buffer.from(chunk))
    const body = Buffer.concat(chunks).toString('utf8')
    const isComplexity = body.includes('complexity evaluator')
    const isProposal = body.includes('safe-write proposal model')
    const objective = 'Guarded approval E2E'
    const createdAt = body.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/)?.[0]
      ?? new Date().toISOString()
    const output = isComplexity
      ? {
          reasons: ['One explicit guarded write'],
          riskFlags: [],
          route: 'single-agent',
          score: 1,
          suggestedWorkers: 1,
        }
      : isProposal
        ? {
            writes: [{
              content: proposedContent,
              filePath: assignedFile,
            }],
          }
        : {
          createdAt,
          dagId: 'dag-guarded-e2e',
          objective,
          schemaVersion: 1,
          tasks: [{
            assignedFiles: [assignedFile],
            dependencies: [],
            estimatedComplexity: 1,
            id: 'write',
            objective: 'Replace the assigned file content',
            requiredTools: ['fs.safeWrite'],
            spawnDepth: 1,
            title: 'Guarded write',
          }],
        }
    response.writeHead(200, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify({
      choices: [{
        finish_reason: 'stop',
        index: 0,
        message: {
          content: JSON.stringify(output),
          role: 'assistant',
        },
      }],
      created: Math.floor(Date.now() / 1_000),
      id: `chatcmpl-${Date.now()}`,
      model: 'axis-e2e-model',
      object: 'chat.completion',
      usage: {
        completion_tokens: 20,
        prompt_tokens: 20,
        total_tokens: 40,
      },
    }))
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address() as AddressInfo
  return {
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve())
    }),
  }
}

async function createSessionAndReload(page: Page, projectRoot: string): Promise<void> {
  await createSession(page, projectRoot)
  await reloadWorkbench(page)
}

async function createSession(page: Page, projectRoot: string): Promise<{ id: string }> {
  const authorizedRoot = await page.evaluate(
    (defaultPath) => window.pivot.invoke('project:choose-directory', { defaultPath }),
    projectRoot,
  )
  expect(authorizedRoot).toBeTruthy()
  return page.evaluate(
    (nextProjectRoot) => window.pivot.invoke('session:create', { projectPath: nextProjectRoot, title: 'Playwright' }),
    authorizedRoot!,
  )
}

async function reloadWorkbench(page: Page): Promise<void> {
  await page.reload()
  await expect(page.locator('main.pivot-shell')).toBeVisible()
  await expect(page.locator('.chat-composer textarea')).toBeEnabled()
}

function normalizedEnvironment(extra: Record<string, string>): Record<string, string> {
  const entries = new Map<string, [string, string]>()
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) entries.set(key.toLowerCase(), [key, value])
  }
  for (const [key, value] of Object.entries(extra)) entries.set(key.toLowerCase(), [key, value])
  return Object.fromEntries(entries.values())
}
