import { readFileSync } from 'node:fs'
import type { AgentManifest, AgentTrigger } from '../../shared/types/domain'

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n?/

/**
 * Parse YAML-like frontmatter from a .agent.md file.
 *
 * This is a lightweight parser for the subset of YAML used in
 * .agent.md manifests (string/string[], no nesting beyond 2 levels).
 * Returns null if the file has no valid frontmatter.
 */
export function parseAgentManifest(source: string): AgentManifest | null {
  const match = FRONTMATTER_RE.exec(source)
  if (!match) return null

  const raw: Record<string, unknown> = {}
  const lines = match[1].split('\n')

  let pendingKey: string | null = null

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) {
      pendingKey = null
      continue
    }

    // Block list item: "- value"
    if (pendingKey && trimmed.startsWith('- ')) {
      const item = trimmed.slice(2).trim()
      if (item) {
        const arr = (raw[pendingKey] as string[]) ?? []
        arr.push(item.replace(/^['"]|['"]$/g, ''))
        raw[pendingKey] = arr
      }
      continue
    }

    pendingKey = null
    const colonIdx = trimmed.indexOf(':')
    if (colonIdx === -1) continue

    const key = trimmed.slice(0, colonIdx).trim()
    const valuePart = trimmed.slice(colonIdx + 1).trim()

    if (valuePart === '') {
      // Block-style sequence follows on indented lines
      pendingKey = key
      continue
    }

    if (valuePart.startsWith('[') && valuePart.endsWith(']')) {
      raw[key] = parseStringArray(valuePart)
    } else {
      raw[key] = valuePart
    }
  }

  return coerceManifest(raw)
}

function parseStringArray(text: string): string[] {
  const inner = text.slice(1, -1).trim()
  if (!inner) return []

  return inner.split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
}

function coerceManifest(raw: Record<string, unknown>): AgentManifest | null {
  const name = asString(raw.name)
  const version = asString(raw.version)
  const description = asString(raw.description)
  if (!name || !version || !description) return null

  return {
    name,
    version,
    description,
    model: asString(raw.model),
    tools: asStringArray(raw.tools),
    triggers: coerceTriggers(raw.triggers),
  }
}

function coerceTriggers(raw: unknown): AgentTrigger[] | undefined {
  // Triggers are complex YAML objects — skip in v0.1 lightweight parse.
  // They will be fully supported when the Axis Engine consumes them.
  return undefined
}

function asString(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined
}

function asStringArray(v: unknown): string[] | undefined {
  if (Array.isArray(v)) {
    const strs = v.filter((x): x is string => typeof x === 'string')
    return strs.length > 0 ? strs : undefined
  }
  return undefined
}

/**
 * Read and parse a .agent.md file from disk.
 * Returns null if the file doesn't exist or has invalid frontmatter.
 */
export function loadAgentManifest(filePath: string): AgentManifest | null {
  try {
    const source = readFileSync(filePath, 'utf-8')
    return parseAgentManifest(source)
  } catch {
    return null
  }
}
