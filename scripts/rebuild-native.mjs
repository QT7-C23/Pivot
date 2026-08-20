import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const mode = process.argv[2]

if (mode !== 'electron' && mode !== 'node') {
  console.error('Usage: node scripts/rebuild-native.mjs <electron|node>')
  process.exit(1)
}

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const electronVersion = packageJson.devDependencies?.electron?.replace(/^[^\d]*/, '')
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const require = createRequire(import.meta.url)
const bindingPath = fileURLToPath(new URL('../node_modules/better-sqlite3/build/Release/better_sqlite3.node', import.meta.url))
const cachePath = fileURLToPath(new URL(`../.native-cache/better-sqlite3/${mode}/better_sqlite3.node`, import.meta.url))

if (isNativeBindingUsable(mode)) {
  cacheCurrentBinding()
  console.log(`better-sqlite3 native binding already matches ${mode}`)
  process.exit(0)
}

if (restoreCachedBinding() && isNativeBindingUsable(mode)) {
  console.log(`restored cached better-sqlite3 native binding for ${mode}`)
  process.exit(0)
}

const env = {
  ...process.env,
}

if (mode === 'electron') {
  env.npm_config_runtime = 'electron'
  env.npm_config_target = electronVersion
  env.npm_config_disturl = 'https://electronjs.org/headers'
} else {
  delete env.npm_config_runtime
  delete env.npm_config_target
  delete env.npm_config_disturl
}

const result = spawnSync(npmCommand, ['rebuild', 'better-sqlite3'], {
  env,
  shell: process.platform === 'win32',
  stdio: 'inherit',
})

if (result.error) {
  console.error(result.error.message)
}

if (result.status === 0) {
  cacheCurrentBinding()
}

process.exit(result.status ?? 1)

function cacheCurrentBinding() {
  if (!existsSync(bindingPath)) {
    return
  }

  mkdirSync(fileURLToPath(new URL(`../.native-cache/better-sqlite3/${mode}/`, import.meta.url)), {
    recursive: true,
  })
  copyFileSync(bindingPath, cachePath)
}

function restoreCachedBinding() {
  if (!existsSync(cachePath)) {
    return false
  }

  mkdirSync(fileURLToPath(new URL('../node_modules/better-sqlite3/build/Release/', import.meta.url)), {
    recursive: true,
  })
  copyFileSync(cachePath, bindingPath)
  return true
}

function isNativeBindingUsable(targetMode) {
  if (targetMode === 'node') {
    try {
      const { runSqliteNativeSmoke } = require('./sqlite-native-smoke.cjs')
      runSqliteNativeSmoke('node')
      return true
    } catch {
      return false
    }
  }

  const electronCommand = process.platform === 'win32'
    ? fileURLToPath(new URL('../node_modules/electron/dist/electron.exe', import.meta.url))
    : fileURLToPath(new URL('../node_modules/.bin/electron', import.meta.url))
  const smokeScript = fileURLToPath(new URL('./electron-native-smoke.cjs', import.meta.url))
  const result = spawnSync(electronCommand, [smokeScript], {
    env: process.env,
    shell: false,
    stdio: 'ignore',
  })

  return result.status === 0
}
