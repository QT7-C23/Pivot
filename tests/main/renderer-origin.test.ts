import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { isTrustedRendererUrl, rendererEntryUrl } from '../../src/main/services/renderer-origin'

describe('renderer origin boundary', () => {
  it('accepts only the packaged renderer file in production', () => {
    const entry = rendererEntryUrl(undefined, path.join('D:\\app', 'out', 'main'))

    expect(isTrustedRendererUrl(entry, entry)).toBe(true)
    expect(isTrustedRendererUrl(pathToFileURL('D:\\tmp\\hostile.html').href, entry)).toBe(false)
    expect(isTrustedRendererUrl('https://example.com', entry)).toBe(false)
  })

  it('accepts the configured development origin but rejects external origins', () => {
    const entry = 'http://localhost:5173/'

    expect(isTrustedRendererUrl('http://localhost:5173/settings', entry)).toBe(true)
    expect(isTrustedRendererUrl('http://127.0.0.1:5173/', entry)).toBe(false)
    expect(isTrustedRendererUrl('https://example.com/', entry)).toBe(false)
  })
})
