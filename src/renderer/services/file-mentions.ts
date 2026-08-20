export interface ActiveFileMention {
  end: number
  query: string
  start: number
}

export function extractFileMentionQuery(source: string, cursor = source.length): ActiveFileMention | null {
  const boundedCursor = Math.max(0, Math.min(cursor, source.length))
  const match = /(?:^|\s)@([^\s@]*)$/.exec(source.slice(0, boundedCursor))
  if (!match) return null

  const mentionOffset = match[0].lastIndexOf('@')
  return {
    end: boundedCursor,
    query: match[1] ?? '',
    start: match.index + mentionOffset,
  }
}

export function replaceFileMention(
  source: string,
  mention: ActiveFileMention,
  relativePath: string,
): string {
  const displayPath = /\s/.test(relativePath) ? `"${relativePath.replaceAll('"', '\\"')}"` : relativePath
  return `${source.slice(0, mention.start)}@${displayPath}${source.slice(mention.end)}`
}
