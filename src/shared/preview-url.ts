export const DEFAULT_PREVIEW_URL = 'http://localhost:3000/'

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

export function normalizePreviewUrl(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  const withProtocol = isLoopbackInput(trimmed)
    ? `http://${trimmed}`
    : hasScheme(trimmed)
      ? trimmed
      : `https://${trimmed}`

  try {
    const url = new URL(withProtocol)
    if (url.username || url.password || !isAllowedPreviewUrl(url.toString())) return null
    return url.toString()
  } catch {
    return null
  }
}

export function isAllowedPreviewUrl(input: string): boolean {
  try {
    const url = new URL(input)
    if (url.username || url.password) return false
    if (url.protocol === 'https:') return true
    return url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname)
  } catch {
    return false
  }
}

function hasScheme(value: string): boolean {
  return /^[a-z][a-z\d+.-]*:/i.test(value)
}

function isLoopbackInput(value: string): boolean {
  return /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:[/?#]|$)/i.test(value)
}
