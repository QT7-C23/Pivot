export function parseArgs(input: string | undefined, fallback: string[] = []): string[] {
  if (!input?.trim()) {
    return fallback
  }

  const parsed = JSON.parse(input) as unknown
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== 'string')) {
    throw new Error('CLI args must be a JSON string array')
  }

  return parsed
}
