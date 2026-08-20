import { useEffect, useMemo, useState } from 'react'
import { SEARCH_DEBOUNCE_MS } from '../../shared/constants'
import type { FileSearchEntry } from '../../shared/types/domain'
import { fileService } from '../services/file.service'
import { extractFileMentionQuery } from '../services/file-mentions'

export function useFileMentionSearch(
  sessionId: string | null,
  draft: string,
  cursor: number,
): {
  error: string | null
  isSearching: boolean
  mention: ReturnType<typeof extractFileMentionQuery>
  results: FileSearchEntry[]
} {
  const mention = useMemo(() => extractFileMentionQuery(draft, cursor), [cursor, draft])
  const [results, setResults] = useState<FileSearchEntry[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const query = mention?.query.trim() ?? ''
    if (!sessionId || !query) {
      setResults([])
      setIsSearching(false)
      setError(null)
      return undefined
    }

    let disposed = false
    setIsSearching(true)
    const timer = window.setTimeout(() => {
      void fileService.search(sessionId, query, 8).then((nextResults) => {
        if (disposed) return
        setResults(nextResults)
        setIsSearching(false)
        setError(null)
      }).catch((searchError: unknown) => {
        if (disposed) return
        setResults([])
        setIsSearching(false)
        setError(searchError instanceof Error ? searchError.message : 'Failed to search project files')
      })
    }, SEARCH_DEBOUNCE_MS)

    return () => {
      disposed = true
      window.clearTimeout(timer)
    }
  }, [mention?.query, sessionId])

  return { error, isSearching, mention, results }
}
