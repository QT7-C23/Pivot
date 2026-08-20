import { spawnSync } from 'node:child_process'

const npmCliPath = process.env.npm_execpath
const fallbackNpmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'

function runNpm(args) {
  if (npmCliPath) {
    return spawnSync(process.execPath, [npmCliPath, ...args], {
      shell: false,
      stdio: 'inherit',
    })
  }

  return spawnSync(fallbackNpmCommand, args, {
    shell: process.platform === 'win32',
    stdio: 'inherit',
  })
}

const steps = [
  {
    args: ['run', 'test'],
    label: 'Tests',
  },
  {
    args: ['run', 'build'],
    label: 'Typecheck and build',
  },
  {
    args: ['run', 'rebuild:native:electron'],
    label: 'Electron native binding',
  },
]

for (const step of steps) {
  console.log(`\n==> ${step.label}`)
  const result = runNpm(step.args)

  if (result.error) {
    console.error(result.error.message)
  }
  if (result.status !== 0) {
    console.error(`\nMVP verification failed during: ${step.label}`)
    process.exit(result.status ?? 1)
  }
}

console.log('\nMVP verification passed. Native binding is ready for Electron.')
