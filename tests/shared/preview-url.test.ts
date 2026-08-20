import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PREVIEW_URL,
  isAllowedPreviewUrl,
  normalizePreviewUrl,
} from '../../src/shared/preview-url'

describe('preview URL contract', () => {
  it('normalizes local development addresses and ordinary HTTPS hosts', () => {
    expect(normalizePreviewUrl('localhost:3000')).toBe('http://localhost:3000/')
    expect(normalizePreviewUrl('127.0.0.1:5173/app')).toBe('http://127.0.0.1:5173/app')
    expect(normalizePreviewUrl('example.com/docs')).toBe('https://example.com/docs')
    expect(DEFAULT_PREVIEW_URL).toBe('http://localhost:3000/')
  })

  it('allows HTTPS and loopback HTTP while rejecting unsafe protocols and remote cleartext', () => {
    expect(isAllowedPreviewUrl('https://example.com/')).toBe(true)
    expect(isAllowedPreviewUrl('http://localhost:3000/')).toBe(true)
    expect(isAllowedPreviewUrl('http://[::1]:8080/')).toBe(true)
    expect(isAllowedPreviewUrl('http://example.com/')).toBe(false)
    expect(isAllowedPreviewUrl('file:///C:/secret.txt')).toBe(false)
    expect(isAllowedPreviewUrl('javascript:alert(1)')).toBe(false)
    expect(normalizePreviewUrl('file:///C:/secret.txt')).toBeNull()
  })
})
