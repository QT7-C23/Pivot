import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { ELECTRON_RUNTIME_VERSION } from '../../src/shared/runtime-versions'

const packagedMainRuntimeDependencies = [
  '@ai-sdk/anthropic',
  '@ai-sdk/openai',
  '@ai-sdk/openai-compatible',
  '@modelcontextprotocol/sdk',
  'ai',
  'better-sqlite3',
  'chokidar',
  'electron-updater',
  'ignore',
  'node-pty',
  'smol-toml',
  'undici',
  'zod',
] as const

const bundledRendererDependencies = [
  '@tanstack/react-virtual',
  'lucide-react',
  'monaco-editor',
  'react',
  'react-dom',
  'xterm',
  'zustand',
] as const

describe('foundation dependency contract', () => {
  it('declares every product foundation dependency at the application root', async () => {
    const packageJson = JSON.parse(await readFile(path.resolve('package.json'), 'utf8')) as {
      dependencies: Record<string, string>
      devDependencies: Record<string, string>
    }

    expect(packagedMainRuntimeDependencies.filter((name) => !packageJson.dependencies[name])).toEqual([])
    expect(bundledRendererDependencies.filter((name) => !packageJson.devDependencies[name])).toEqual([])
    expect(packageJson.devDependencies).toMatchObject({
      '@playwright/test': expect.any(String),
      '@tailwindcss/vite': expect.any(String),
      '@vitejs/plugin-react': expect.any(String),
      tailwindcss: expect.any(String),
      vitest: expect.any(String),
    })
    expect(packageJson.dependencies).not.toHaveProperty('@vitejs/plugin-react')
    expect(packageJson.dependencies).not.toHaveProperty('monaco-editor')
    expect(packageJson.dependencies).not.toHaveProperty('react')
  })

  it('keeps the dependency baseline linked to concrete owner Modules', async () => {
    const baseline = await readFile(path.resolve('docs/foundation-dependencies.md'), 'utf8')
    for (const owner of [
      'AiSdkProviderAdapter',
      'ApplicationUpdateService',
      'McpClientSession',
      'ProjectFileWatcher',
      'UndiciProviderPinnedRequestAdapter',
    ]) {
      expect(baseline).toContain(owner)
    }
  })

  it('pins the Electron runtime validated with disk-backed SQLite', async () => {
    const packageJson = JSON.parse(await readFile(path.resolve('package.json'), 'utf8')) as {
      dependencies: Record<string, string>
      devDependencies: Record<string, string>
    }

    expect(packageJson.devDependencies.electron.replace(/^[^\d]*/, '')).toBe(ELECTRON_RUNTIME_VERSION)
    expect(packageJson.dependencies['better-sqlite3']).toMatch(/^\^13\./)
  })
})
