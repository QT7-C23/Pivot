import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const require = createRequire(import.meta.url)
const args = new Set(process.argv.slice(2))
const jsonOutput = args.has('--json')
const repositoryOnly = args.has('--repository-only')
const artifactDirectoryArgument = valueAfter('--artifact-dir')
const blockers = []
const checks = []

await checkRepository()
if (!repositoryOnly) checkOperatorAuthority()
if (!repositoryOnly) checkGitTraceability()
if (artifactDirectoryArgument) checkArtifacts(path.resolve(artifactDirectoryArgument))

const report = {
  schemaVersion: 1,
  scope: repositoryOnly ? 'repository' : artifactDirectoryArgument ? 'artifacts' : 'external',
  ready: blockers.length === 0,
  checks,
  blockers,
}

if (jsonOutput) {
  process.stdout.write(`${JSON.stringify(report)}\n`)
} else {
  process.stdout.write(`Pivot external release qualification: ${report.ready ? 'READY' : 'BLOCKED'}\n`)
  for (const check of checks) process.stdout.write(`  PASS ${check.message}\n`)
  for (const blocker of blockers) process.stdout.write(`  BLOCK ${blocker.code}: ${blocker.message}\n`)
}
if (!report.ready) process.exitCode = 1

async function checkRepository() {
  const packageJson = readJson('package.json')
  const releaseConfig = readRequiredText('electron-builder.release.cjs', 'missing_release_config')
  const workflow = readRequiredText('.github/workflows/windows-external-release.yml', 'missing_release_workflow')
  const runbook = readRequiredText('docs/external-release-runbook.md', 'missing_release_runbook')
  const security = readRequiredText('SECURITY.md', 'missing_security_policy')
  const gitignore = readRequiredText('.gitignore', 'missing_gitignore')

  requireCondition(packageJson?.private === true, 'package_not_private', 'package.json must keep npm source publication disabled')
  requireCondition(packageJson?.license === 'Apache-2.0', 'invalid_source_license', 'Pivot source must retain the approved Apache-2.0 license')
  requireCondition(packageJson?.repository?.type === 'git' && packageJson?.repository?.url === 'https://github.com/QT7-C23/Pivot.git', 'invalid_source_repository', 'Pivot must identify the canonical public source repository')
  requireCondition(packageJson?.build?.win?.signAndEditExecutable === true, 'executable_editing_disabled', 'Windows executable metadata and signing must remain enabled')
  requireCondition(packageJson?.build?.win?.signExecutable === true, 'executable_signing_disabled', 'Windows executable signing must remain enabled')
  requireCondition(packageJson?.build?.win?.icon === 'build/icon.svg', 'missing_production_icon_config', 'Windows builds must use the reviewed Pivot icon')
  requireIncludes(releaseConfig, 'forceCodeSigning: true', 'signing_not_forced', 'Release builds must fail rather than emit unsigned artifacts')
  requireIncludes(releaseConfig, "releaseType: 'draft'", 'release_not_draft', 'Automated publishing must create a draft release')
  requireIncludes(releaseConfig, "owner: 'QT7-C23'", 'invalid_release_owner', 'Release artifacts must target the canonical Pivot repository owner')
  requireIncludes(releaseConfig, "repo: 'Pivot'", 'invalid_release_repository', 'Release artifacts must target the canonical Pivot source repository')
  requireIncludes(releaseConfig, "private: false", 'private_update_repository', 'Desktop auto-update must not require a client-side GitHub token')
  requireIncludes(workflow, 'workflow_dispatch:', 'automatic_release_trigger', 'External releases must be manually dispatched')
  requireIncludes(workflow, 'environment: external-release', 'missing_release_environment', 'External releases require the protected GitHub environment')
  requireIncludes(workflow, 'GH_TOKEN: ${{ github.token }}', 'external_publish_token', 'Same-repository publishing must use the short-lived GitHub workflow token')
  requireIncludes(workflow, 'persist-credentials: false', 'persistent_checkout_authority', 'Release checkout must not persist GitHub write credentials')
  requireIncludes(runbook, 'Get-AuthenticodeSignature', 'missing_signature_runbook', 'Runbook must include local Authenticode verification')
  requireIncludes(runbook, 'public Apache-2.0 source repository', 'missing_open_source_boundary', 'Runbook must preserve the approved public source boundary')
  requireIncludes(security, 'private vulnerability reporting', 'missing_private_reporting', 'Security policy must direct reports to a private channel')
  for (const pattern of ['*.pfx', '*.p12', '*.private.pem', '.env.*']) {
    requireIncludes(gitignore, pattern, 'missing_secret_ignore', `Git ignore rules must include ${pattern}`)
  }

  const iconSource = path.resolve('build/icon-source.svg')
  if (!existsSync(iconSource)) {
    block('missing_production_icon_source', 'Reviewed Figma AppIcon source is missing')
  } else {
    const hash = createHash('sha256').update(readFileSync(iconSource)).digest('hex')
    requireCondition(hash === 'c0ee85f726c43b7c8666122cc2feef521ea79861ff4c66d76fa2b7c55649459b', 'production_icon_changed', 'Reviewed Figma AppIcon source hash must match the release contract')
  }

  const secretPattern = /(?:ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/
  for (const file of ['package.json', 'electron-builder.release.cjs', '.github/workflows/windows-external-release.yml']) {
    const content = existsSync(path.resolve(file)) ? readFileSync(path.resolve(file), 'utf8') : ''
    requireCondition(!secretPattern.test(content), 'embedded_release_secret', `Release configuration must not embed a secret in ${file}`)
  }
  await validateReleaseConfiguration()
}

async function validateReleaseConfiguration() {
  const names = [
    'PIVOT_SIGNING_METHOD',
    'PIVOT_AZURE_ENDPOINT',
    'PIVOT_AZURE_ACCOUNT_NAME',
    'PIVOT_AZURE_CERTIFICATE_PROFILE',
    'PIVOT_AZURE_PUBLISHER_NAME',
  ]
  const previous = new Map(names.map((name) => [name, process.env[name]]))
  try {
    const { validateConfiguration } = require('app-builder-lib/out/util/config/config.js')
    process.env.PIVOT_AZURE_ENDPOINT = 'https://eus.codesigning.azure.net/'
    process.env.PIVOT_AZURE_ACCOUNT_NAME = 'release-qualification-account'
    process.env.PIVOT_AZURE_CERTIFICATE_PROFILE = 'release-qualification-profile'
    process.env.PIVOT_AZURE_PUBLISHER_NAME = 'CN=Pivot Release Qualification'
    for (const method of ['pfx', 'azure']) {
      process.env.PIVOT_SIGNING_METHOD = method
      const configPath = require.resolve('../electron-builder.release.cjs')
      delete require.cache[configPath]
      const configuration = require(configPath)
      await validateConfiguration(configuration, { isEnabled: false, add() {} })
      requireCondition(true, `valid_release_schema_${method}`, `Release ${method} configuration matches the installed electron-builder schema`)
    }
  } catch {
    block('invalid_release_schema', 'Release configuration is rejected by the installed electron-builder schema')
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  }
}

function checkOperatorAuthority() {
  requireEnvironment('GH_TOKEN', 'missing_publish_token', 'Provide GitHub publishing authority; the hosted workflow uses its short-lived repository token')
  const signingMethod = (process.env.PIVOT_SIGNING_METHOD || 'pfx').trim().toLowerCase()
  if (signingMethod === 'pfx') {
    requireEnvironment('WIN_CSC_LINK', 'missing_signing_certificate', 'Provide the Windows code-signing certificate through the secret store')
    requireEnvironment('WIN_CSC_KEY_PASSWORD', 'missing_signing_password', 'Provide the Windows certificate password through the secret store')
  } else if (signingMethod === 'azure') {
    requireEnvironment('AZURE_TENANT_ID', 'missing_azure_tenant', 'Provide the Azure tenant ID through the secret store')
    requireEnvironment('AZURE_CLIENT_ID', 'missing_azure_client_id', 'Provide the Azure signing application client ID through the secret store')
    requireEnvironment('AZURE_CLIENT_SECRET', 'missing_azure_client_secret', 'Provide the Azure signing application secret through the secret store')
    requireEnvironment('PIVOT_AZURE_ENDPOINT', 'missing_azure_endpoint', 'Set the Azure Trusted Signing endpoint')
    requireEnvironment('PIVOT_AZURE_ACCOUNT_NAME', 'missing_azure_account', 'Set the Azure Trusted Signing account name')
    requireEnvironment('PIVOT_AZURE_CERTIFICATE_PROFILE', 'missing_azure_profile', 'Set the Azure Trusted Signing certificate profile')
    requireEnvironment('PIVOT_AZURE_PUBLISHER_NAME', 'missing_azure_publisher', 'Set the exact Azure signing publisher name')
  } else {
    block('unsupported_signing_method', 'PIVOT_SIGNING_METHOD must be pfx or azure')
  }
}

function checkGitTraceability() {
  const root = git(['rev-parse', '--show-toplevel'])
  if (!root.ok || path.resolve(root.stdout) !== path.resolve('.')) {
    block('project_not_git_root', 'Pivot must be an independently tracked Git repository before release')
    return
  }
  const remotes = git(['remote'])
  requireCondition(remotes.ok && remotes.stdout.trim().length > 0, 'missing_git_remote', 'Pivot release source must have a configured remote')
  const status = git(['status', '--porcelain'])
  requireCondition(status.ok && status.stdout.trim().length === 0, 'dirty_release_tree', 'Release source must be committed and clean')
}

function checkArtifacts(directory) {
  if (!existsSync(directory) || !statSync(directory).isDirectory()) {
    block('missing_artifact_directory', `Artifact directory does not exist: ${directory}`)
    return
  }
  const files = walk(directory)
  const installer = files.find((file) => /Pivot-.*-Windows-x64\.exe$/i.test(file))
  const metadata = files.find((file) => /(?:latest|beta)\.ya?ml$/i.test(path.basename(file)))
  const blockmap = files.find((file) => /\.blockmap$/i.test(file))
  const appUpdate = files.find((file) => /win-unpacked[\\/]resources[\\/]app-update\.yml$/i.test(file))
  requireCondition(Boolean(installer), 'missing_signed_installer', 'NSIS installer artifact is missing')
  requireCondition(Boolean(metadata), 'missing_update_metadata', 'Update channel metadata is missing')
  requireCondition(Boolean(blockmap), 'missing_update_blockmap', 'Update blockmap is missing')
  requireCondition(Boolean(appUpdate), 'missing_packaged_update_config', 'Packaged app-update.yml is missing')
  if (installer) verifyAuthenticode(installer)
}

function verifyAuthenticode(installer) {
  if (process.platform !== 'win32') {
    block('signature_check_requires_windows', 'Authenticode verification must run on Windows')
    return
  }
  const literal = installer.replaceAll("'", "''")
  const script = `$s=Get-AuthenticodeSignature -LiteralPath '${literal}'; [Console]::Out.Write($s.Status.ToString())`
  const encoded = Buffer.from(script, 'utf16le').toString('base64')
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], { encoding: 'utf8' })
  requireCondition(result.status === 0 && result.stdout.trim() === 'Valid', 'invalid_authenticode_signature', 'Installer Authenticode signature is not valid')
}

function requireEnvironment(name, code, message) {
  requireCondition(Boolean(process.env[name]?.trim()), code, message)
}

function requireIncludes(content, needle, code, message) {
  requireCondition(content.includes(needle), code, message)
}

function requireCondition(condition, code, message) {
  if (condition) checks.push({ code, message })
  else block(code, message)
}

function block(code, message) {
  blockers.push({ code, message })
}

function readRequiredText(file, code) {
  const absolute = path.resolve(file)
  if (!existsSync(absolute)) {
    block(code, `Required release file is missing: ${file}`)
    return ''
  }
  return readFileSync(absolute, 'utf8')
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(path.resolve(file), 'utf8'))
  } catch {
    block('invalid_package_json', `${file} is missing or invalid`)
    return null
  }
}

function git(arguments_) {
  const result = spawnSync('git', arguments_, { cwd: path.resolve('.'), encoding: 'utf8' })
  return { ok: result.status === 0, stdout: result.stdout ?? '' }
}

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name)
    return entry.isDirectory() ? walk(target) : [target]
  })
}

function valueAfter(flag) {
  const values = process.argv.slice(2)
  const index = values.indexOf(flag)
  return index >= 0 ? values[index + 1] : undefined
}
