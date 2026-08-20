import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const executableArgument = process.argv.slice(2).find((argument) => !argument.startsWith('--'))
const executablePath = path.resolve(executableArgument ?? 'release/win-unpacked/Pivot.exe')
const captureWelcome = process.argv.includes('--welcome')
const captureWorkbench = process.argv.includes('--workbench')
const captureDesktop = process.argv.includes('--desktop')
const captureTimeline = process.argv.includes('--timeline')
const capturePreview = process.argv.includes('--preview')
const captureEditorLazy = process.argv.includes('--editor-lazy')
const requestedLocale = process.argv.find((argument) => argument.startsWith('--locale='))?.slice('--locale='.length)
if (!existsSync(executablePath)) {
  throw new Error(`Packaged Pivot executable not found: ${executablePath}`)
}

const runId = `${process.pid}-${Date.now()}`
const userDataPath = path.join(os.tmpdir(), `pivot-packaged-e2e-${runId}`)
const resultPath = path.join(userDataPath, 'smoke-result.json')
const screenshotPath = path.join(userDataPath, 'settings.png')
mkdirSync(userDataPath, { recursive: true })

// Windows treats environment names case-insensitively. Normalize inherited keys
// so process launch cannot fail when both Path and PATH are present.
const normalizedEnvironment = new Map()
for (const [key, value] of Object.entries(process.env)) {
  normalizedEnvironment.set(key.toLowerCase(), [key, value])
}
const env = Object.fromEntries(normalizedEnvironment.values())
Object.assign(env, {
  PIVOT_DISABLE_HARDWARE_ACCELERATION: '1',
  PIVOT_E2E_RESULT_PATH: resultPath,
  PIVOT_E2E_SCREENSHOT_PATH: screenshotPath,
  PIVOT_E2E_SMOKE: '1',
  PIVOT_E2E_USER_DATA: userDataPath,
})
if (requestedLocale) env.PIVOT_E2E_LOCALE = requestedLocale
if (!captureWelcome) env.PIVOT_E2E_SETTINGS = '1'
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
if (captureDesktop) {
  delete env.PIVOT_E2E_SETTINGS
  env.PIVOT_E2E_DESKTOP = '1'
}

const child = spawn(executablePath, ['--headless', '--no-sandbox', '--disable-gpu'], {
  cwd: path.dirname(executablePath),
  env,
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
})

let smokePassed = false
child.stdout.on('data', (chunk) => process.stdout.write(chunk))
child.stderr.on('data', (chunk) => process.stderr.write(chunk))

const timeout = setTimeout(() => {
  child.kill()
  process.stderr.write('Packaged Pivot smoke test timed out.\n')
  process.exit(1)
}, 20_000)

const resultPoll = setInterval(() => {
  if (!existsSync(resultPath)) return
  const result = JSON.parse(readFileSync(resultPath, 'utf8'))
  clearInterval(resultPoll)
  clearTimeout(timeout)
  smokePassed = Boolean(result.passed)
  process.stdout.write(`PIVOT_PACKAGED_E2E ${result.passed ? 'PASS' : 'FAIL'} ${JSON.stringify(result)}\n`)
  if (!result.passed) child.kill()
}, 100)

child.on('error', (error) => {
  clearInterval(resultPoll)
  clearTimeout(timeout)
  process.stderr.write(`Packaged Pivot failed to launch: ${error.message}\n`)
  process.exitCode = 1
})

child.on('exit', (code) => {
  clearInterval(resultPoll)
  clearTimeout(timeout)
  if (!smokePassed && existsSync(resultPath)) {
    const result = JSON.parse(readFileSync(resultPath, 'utf8'))
    smokePassed = Boolean(result.passed)
    process.stdout.write(`PIVOT_PACKAGED_E2E ${result.passed ? 'PASS' : 'FAIL'} ${JSON.stringify(result)}\n`)
  }
  if (code !== 0 || !smokePassed) process.exitCode = 1
})
