import { spawn } from 'node:child_process'
import electronPath from 'electron'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const userDataPath = path.join(os.tmpdir(), `pivot-e2e-${process.pid}`)
mkdirSync(userDataPath, { recursive: true })
const resultPath = path.join(userDataPath, 'smoke-result.json')
const screenshotPath = path.join(userDataPath, 'settings.png')
const captureWelcome = process.argv.includes('--welcome')
const captureWorkbench = process.argv.includes('--workbench')
const captureDesktop = process.argv.includes('--desktop')
const captureProvider = process.argv.includes('--provider')
const capturePlugins = process.argv.includes('--plugins')
const captureTimeline = process.argv.includes('--timeline')
const capturePreview = process.argv.includes('--preview')
const captureEditorLazy = process.argv.includes('--editor-lazy')
const captureRuntime = process.argv.includes('--runtime')
const captureNow = process.argv.includes('--now')
const captureWork = process.argv.includes('--work')
const captureProject = process.argv.includes('--project')
const captureAutomations = process.argv.includes('--automations')
const captureExtensions = process.argv.includes('--extensions')
const captureCommandPalette = process.argv.includes('--command-palette')
const captureNewProject = process.argv.includes('--new-project')
const headed = process.argv.includes('--headed')

const env = normalizedEnvironment({ PIVOT_DISABLE_HARDWARE_ACCELERATION: '1', PIVOT_E2E_RESULT_PATH: resultPath, PIVOT_E2E_SCREENSHOT_PATH: screenshotPath, PIVOT_E2E_SMOKE: '1', PIVOT_E2E_USER_DATA: userDataPath })
if (!captureWelcome && !captureNow && !captureCommandPalette && !captureNewProject) env.PIVOT_E2E_SETTINGS = '1'
if (captureNow) env.PIVOT_E2E_NOW = '1'
if (captureWork) {
  delete env.PIVOT_E2E_SETTINGS
  env.PIVOT_E2E_WORK = '1'
}
if (captureProject) {
  delete env.PIVOT_E2E_SETTINGS
  env.PIVOT_E2E_PROJECT = '1'
}
if (captureAutomations) {
  delete env.PIVOT_E2E_SETTINGS
  env.PIVOT_E2E_AUTOMATIONS = '1'
}
if (captureExtensions) {
  delete env.PIVOT_E2E_SETTINGS
  env.PIVOT_E2E_EXTENSIONS = '1'
}
if (captureCommandPalette) {
  delete env.PIVOT_E2E_SETTINGS
  env.PIVOT_E2E_COMMAND_PALETTE = '1'
}
if (captureNewProject) {
  delete env.PIVOT_E2E_SETTINGS
  env.PIVOT_E2E_NEW_PROJECT = '1'
  env.PIVOT_E2E_NEW_PROJECT_PARENT = userDataPath
}
if (captureProvider) env.PIVOT_E2E_PROVIDER = '1'
if (capturePlugins) env.PIVOT_E2E_PLUGINS = '1'
if (captureWorkbench) {
  delete env.PIVOT_E2E_SETTINGS
  env.PIVOT_E2E_WORKBENCH = '1'
}
if (captureTimeline) {
  delete env.PIVOT_E2E_SETTINGS
  env.PIVOT_E2E_TIMELINE = '1'
}
if (capturePreview) {
  delete env.PIVOT_E2E_SETTINGS
  env.PIVOT_E2E_PREVIEW = '1'
}
if (captureEditorLazy) {
  delete env.PIVOT_E2E_SETTINGS
  env.PIVOT_E2E_EDITOR_LAZY = '1'
}
if (captureRuntime) {
  delete env.PIVOT_E2E_SETTINGS
  env.PIVOT_E2E_RUNTIME = '1'
}
if (captureDesktop) {
  delete env.PIVOT_E2E_SETTINGS
  env.PIVOT_E2E_DESKTOP = '1'
}

const electronArgs = [...(headed ? [] : ['--headless']), '--no-sandbox', '--disable-gpu', '--disable-crash-reporter', '--disable-breakpad', process.cwd()]
const child = spawn(electronPath, electronArgs, {
  cwd: process.cwd(),
  env,
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
})

let output = ''
let smokePassed = false
child.stdout.on('data', (chunk) => { output += chunk.toString(); process.stdout.write(chunk) })
child.stderr.on('data', (chunk) => { output += chunk.toString(); process.stderr.write(chunk) })
const timeout = setTimeout(() => {
  child.kill()
  process.stderr.write('Pivot Electron smoke test timed out.\n')
  process.exit(1)
}, 20_000)
const resultPoll = setInterval(() => {
  if (!existsSync(resultPath)) return
  const result = JSON.parse(readFileSync(resultPath, 'utf8'))
  clearInterval(resultPoll)
  clearTimeout(timeout)
  smokePassed = Boolean(result.passed)
  process.stdout.write(`PIVOT_E2E_SMOKE ${result.passed ? 'PASS' : 'FAIL'} ${JSON.stringify(result)}\n`)
  if (!result.passed) child.kill()
}, 100)

child.on('exit', (code) => {
  clearTimeout(timeout)
  clearInterval(resultPoll)
  if (!smokePassed && existsSync(resultPath)) {
    const result = JSON.parse(readFileSync(resultPath, 'utf8'))
    smokePassed = Boolean(result.passed)
    process.stdout.write(`PIVOT_E2E_SMOKE ${result.passed ? 'PASS' : 'FAIL'} ${JSON.stringify(result)}\n`)
  }
  if (code !== 0 || !smokePassed) process.exitCode = 1
})

function normalizedEnvironment(extra) {
  const entries = new Map()
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) entries.set(key.toLowerCase(), [key, value])
  }
  for (const [key, value] of Object.entries(extra)) entries.set(key.toLowerCase(), [key, value])
  return Object.fromEntries(entries.values())
}
