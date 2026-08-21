import { spawnSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('external Windows release qualification', () => {
  it('prominently identifies the public build as Beta testing software', () => {
    const readme = readFileSync(path.resolve('README.md'), 'utf8')

    expect(readme).toContain('Beta-2.0.22')
    expect(readme).toMatch(/public testing build/i)
    expect(readme).toMatch(/not a stable production release/i)
    expect(readme).toMatch(/back up important work/i)
  })

  it('keeps publishing explicit, signed, draft-only and compatible with the public Apache source repository', () => {
    const packageJson = readJson('package.json') as {
      build: { win: Record<string, unknown> }
      license: string
      private: boolean
      repository: { type: string; url: string }
      scripts: Record<string, string>
    }
    const releaseConfig = readFileSync(path.resolve('electron-builder.release.cjs'), 'utf8')
    const workflow = readFileSync(path.resolve('.github/workflows/windows-external-release.yml'), 'utf8')

    // `private` prevents accidental npm publication; it does not make the
    // GitHub source repository private.
    expect(packageJson.private).toBe(true)
    expect(packageJson.license).toBe('Apache-2.0')
    expect(packageJson.repository).toEqual({
      type: 'git',
      url: 'https://github.com/QT7-C23/Pivot.git',
    })
    expect(packageJson.build.win.signAndEditExecutable).not.toBe(false)
    expect(packageJson.build.win.icon).toBe('build/icon.svg')
    expect(packageJson.scripts['release:preflight']).toContain('verify-external-release.mjs')
    expect(packageJson.scripts['release:windows']).toContain('electron-builder.release.cjs')
    expect(releaseConfig).toContain('forceCodeSigning: true')
    expect(releaseConfig).toContain("releaseType: 'draft'")
    expect(releaseConfig).toContain("owner: 'QT7-C23'")
    expect(releaseConfig).toContain("repo: 'Pivot'")
    expect(releaseConfig).not.toContain('PIVOT_RELEASE_OWNER')
    expect(releaseConfig).not.toContain('PIVOT_RELEASE_REPO')
    expect(releaseConfig).toContain('PIVOT_SIGNING_METHOD')
    expect(releaseConfig).toContain('azureSignOptions')
    expect(releaseConfig).not.toMatch(/ghp_[A-Za-z0-9]+|github_pat_[A-Za-z0-9_]+/)
    expect(workflow).toContain('workflow_dispatch:')
    expect(workflow).toContain('environment: external-release')
    expect(workflow).toContain('WIN_CSC_LINK')
    expect(workflow).toContain('AZURE_TENANT_ID')
    expect(workflow).toContain('PIVOT_SIGNING_METHOD')
    expect(workflow).toContain('contents: write')
    expect(workflow).toContain('GH_TOKEN: ${{ github.token }}')
    expect(workflow).not.toContain('PIVOT_RELEASE_TOKEN')
    expect(workflow).not.toContain('PIVOT_RELEASE_OWNER')
    expect(workflow).not.toContain('PIVOT_RELEASE_REPO')
    expect(workflow).toContain("$env:GITHUB_REPOSITORY -ne 'QT7-C23/Pivot'")
    expect(workflow).toContain("$env:GITHUB_REF -ne 'refs/heads/main'")
    expect(workflow).toContain('REQUESTED_RELEASE_VERSION: ${{ inputs.release_version }}')
    expect(workflow).not.toContain("'${{ inputs.release_version }}'")
    expect(workflow).not.toMatch(/push:|pull_request:/)
  })

  it('passes repository-owned release checks without requiring operator secrets', () => {
    const result = runPreflight(['--repository-only', '--json'])
    const report = JSON.parse(result.stdout) as {
      checks: Array<{ code: string }>
      ready: boolean
      scope: string
    }
    expect(result.status, result.stderr).toBe(0)
    expect(report).toMatchObject({ ready: true, scope: 'repository' })
    expect(report.checks.map((check) => check.code)).toEqual(expect.arrayContaining([
      'valid_release_schema_pfx',
      'valid_release_schema_azure',
    ]))
  })

  it('composes a scalable application icon from the reviewed Figma vector', () => {
    const result = spawnSync(process.execPath, ['scripts/render-release-icon.mjs'], {
      cwd: path.resolve('.'),
      encoding: 'utf8',
    })
    const icon = readFileSync(path.resolve('build/icon.svg'), 'utf8')

    expect(result.status, result.stderr).toBe(0)
    expect(icon).toContain('viewBox="0 0 120 120"')
    expect(icon).toContain('<rect width="120" height="120" rx="28" fill="#111"/>')
    expect(icon).toContain('transform="translate(26.31 32.5)"')
  })

  it('fails closed and names absent external authority without leaking values', () => {
    const environment = { ...process.env }
    for (const name of [
      'GH_TOKEN',
      'WIN_CSC_KEY_PASSWORD',
      'WIN_CSC_LINK',
    ]) delete environment[name]

    const result = runPreflight(['--json'], environment)
    const report = JSON.parse(result.stdout) as { blockers: Array<{ code: string }> }
    const codes = report.blockers.map((blocker) => blocker.code)

    expect(result.status).toBe(1)
    expect(codes).toEqual(expect.arrayContaining([
      'missing_publish_token',
      'missing_signing_certificate',
      'missing_signing_password',
    ]))
    expect(codes).not.toContain('missing_release_owner')
    expect(codes).not.toContain('missing_release_repository')
    expect(result.stdout).not.toContain('undefined')
  })

  it('fails closed on incomplete Azure signing authority without requesting a PFX', () => {
    const environment: NodeJS.ProcessEnv = {
      ...process.env,
      GH_TOKEN: 'qualification-token',
      PIVOT_SIGNING_METHOD: 'azure',
    }
    for (const name of [
      'AZURE_CLIENT_ID',
      'AZURE_CLIENT_SECRET',
      'AZURE_TENANT_ID',
      'PIVOT_AZURE_ACCOUNT_NAME',
      'PIVOT_AZURE_CERTIFICATE_PROFILE',
      'PIVOT_AZURE_ENDPOINT',
      'PIVOT_AZURE_PUBLISHER_NAME',
      'WIN_CSC_KEY_PASSWORD',
      'WIN_CSC_LINK',
    ]) delete environment[name]

    const result = runPreflight(['--json'], environment)
    const report = JSON.parse(result.stdout) as { blockers: Array<{ code: string }> }
    const codes = report.blockers.map((blocker) => blocker.code)

    expect(result.status).toBe(1)
    expect(codes).toEqual(expect.arrayContaining([
      'missing_azure_account',
      'missing_azure_client_id',
      'missing_azure_client_secret',
      'missing_azure_profile',
      'missing_azure_tenant',
    ]))
    expect(codes).not.toContain('missing_signing_certificate')
    expect(codes).not.toContain('missing_signing_password')
  })

  it('documents the operator-only ceremony and secret handling boundary', () => {
    const runbook = readFileSync(path.resolve('docs/external-release-runbook.md'), 'utf8')
    const security = readFileSync(path.resolve('SECURITY.md'), 'utf8')
    const gitattributes = readFileSync(path.resolve('.gitattributes'), 'utf8')
    const gitignore = readFileSync(path.resolve('.gitignore'), 'utf8')

    expect(runbook).toMatch(/same repository/i)
    expect(runbook).not.toMatch(/Pivot-Releases/)
    expect(runbook).toMatch(/public.*source repository/i)
    expect(runbook).not.toMatch(/private (desktop )?source repository/i)
    expect(runbook).toMatch(/previous-version/i)
    expect(runbook).toMatch(/Get-AuthenticodeSignature/)
    expect(security).toMatch(/private vulnerability reporting/i)
    expect(gitattributes).toContain('* text=auto eol=lf')
    expect(gitattributes).toContain('*.png binary')
    expect(gitignore).toContain('*.pfx')
    expect(gitignore).toContain('*.p12')
    expect(gitignore).toContain('*.private.pem')
    expect(gitignore).toContain('.env.*')
    expect(gitignore).toContain('.codex/')
    expect(gitignore).toContain('test-results/')
    expect(gitignore).toContain('.playwright/')
    expect(gitignore).toContain('.shannon/')
    expect(gitignore).toContain('.tmp-preview/')
    expect(gitignore).toContain('tmp/')
    expect(gitignore).toContain('Run tests/')
    expect(gitignore).toContain('pivot-security-audit/')
    expect(gitignore).toContain('Pivot UI V2-Figma*.md')
    expect(gitignore).toContain('产品定位.md')
    expect(gitignore).toContain('核心价值主张.md')
  })

  it('does not publish a maintainer Windows home directory in repository documentation', () => {
    const leakedPaths = walkFiles(path.resolve('docs'))
      .filter((filePath) => filePath.endsWith('.md'))
      .flatMap((filePath) => readFileSync(filePath, 'utf8')
        .split(/\r?\n/u)
        .map((line, index) => ({ filePath, line, lineNumber: index + 1 })))
      .filter(({ line }) => /[A-Za-z]:\\Users\\[^\\\s]+/iu.test(line))
      .map(({ filePath, lineNumber }) => `${path.relative(path.resolve('.'), filePath)}:${lineNumber}`)

    expect(leakedPaths).toEqual([])
  })
})

function runPreflight(args: string[], env = process.env) {
  return spawnSync(process.execPath, ['scripts/verify-external-release.mjs', ...args], {
    cwd: path.resolve('.'),
    encoding: 'utf8',
    env,
  })
}

function readJson(filePath: string): unknown {
  return JSON.parse(readFileSync(path.resolve(filePath), 'utf8')) as unknown
}

function walkFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name)
    return entry.isDirectory() ? walkFiles(target) : [target]
  })
}
