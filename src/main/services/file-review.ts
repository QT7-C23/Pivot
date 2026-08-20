import { randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'
import { diffLines, type Change } from 'diff'
import type {
  FileReviewDecision,
  FileReviewHunk,
  FileReviewRecord,
  FileReviewResolution,
  FileReviewStatus,
} from '../../shared/types/domain'
import { writeTextFile } from './file-system'

interface FileReviewInput {
  checkpointId: string | null
  filePath: string
  originalContent: string
  proposedContent: string
  sessionId: string
}

interface FileReviewRow {
  checkpoint_id: string | null
  created_at: string
  decisions_json: string
  file_path: string
  id: string
  original_content: string
  proposed_content: string
  session_id: string
  status: FileReviewStatus
  updated_at: string
}

interface DiffGroup {
  modifiedContent: string
  modifiedStart: number
  originalContent: string
  originalStart: number
}

export class FileReviewStore {
  private readonly db: Database

  constructor(databasePath = ':memory:') {
    this.db = new Database(databasePath)
    this.db.pragma('journal_mode = WAL')
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS file_reviews (
        id TEXT PRIMARY KEY,
        checkpoint_id TEXT,
        session_id TEXT NOT NULL,
        file_path TEXT NOT NULL,
        original_content TEXT NOT NULL,
        proposed_content TEXT NOT NULL,
        decisions_json TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'rejected', 'mixed')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_file_reviews_session_updated
        ON file_reviews(session_id, updated_at DESC);
    `)
  }

  record(input: FileReviewInput): FileReviewRecord {
    const sessionId = input.sessionId.trim()
    if (!sessionId) throw new Error('Expected a session id')
    const id = `review-${randomUUID()}`
    const timestamp = new Date().toISOString()
    const decisions = createDiffGroups(input.originalContent, input.proposedContent).map(() => 'pending' as const)

    this.db.prepare(`
      INSERT INTO file_reviews (
        id, checkpoint_id, session_id, file_path, original_content,
        proposed_content, decisions_json, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
    `).run(
      id,
      input.checkpointId,
      sessionId,
      input.filePath,
      input.originalContent,
      input.proposedContent,
      JSON.stringify(decisions),
      timestamp,
      timestamp,
    )

    return this.require(id)
  }

  get(reviewId: string): FileReviewRecord | null {
    const row = this.db.prepare('SELECT * FROM file_reviews WHERE id = ?').get(reviewId) as FileReviewRow | undefined
    return row ? toReview(row) : null
  }

  listForSession(sessionId: string, includeResolved = false): FileReviewRecord[] {
    const rows = this.db.prepare(includeResolved
      ? 'SELECT * FROM file_reviews WHERE session_id = ? ORDER BY updated_at DESC, rowid DESC'
      : "SELECT * FROM file_reviews WHERE session_id = ? AND status = 'pending' ORDER BY updated_at DESC, rowid DESC")
      .all(sessionId) as FileReviewRow[]
    return rows.map(toReview)
  }

  latestPendingForFile(sessionId: string, filePath: string): FileReviewRecord | null {
    const row = this.db.prepare(`
      SELECT * FROM file_reviews
      WHERE session_id = ? AND file_path = ? AND status = 'pending'
      ORDER BY updated_at DESC, rowid DESC LIMIT 1
    `).get(sessionId, filePath) as FileReviewRow | undefined
    return row ? toReview(row) : null
  }

  async resolve(
    reviewId: string,
    projectRoot: string,
    resolution: FileReviewResolution,
  ): Promise<FileReviewRecord> {
    const review = this.require(reviewId)
    let decisions = review.hunks.map((hunk) => hunk.decision)

    if (resolution.decision === 'reset') {
      decisions = decisions.map(() => 'pending')
    } else {
      const decision: FileReviewDecision = resolution.decision === 'accept' ? 'accepted' : 'rejected'
      if (resolution.hunkIndex === undefined) {
        decisions = decisions.map(() => decision)
      } else {
        if (!Number.isInteger(resolution.hunkIndex) || !decisions[resolution.hunkIndex]) {
          throw new Error(`Unknown review hunk: ${resolution.hunkIndex}`)
        }
        decisions[resolution.hunkIndex] = decision
      }
    }

    const status = statusFor(decisions)
    const updatedAt = new Date().toISOString()
    const currentContent = mergeReview(review.originalContent, review.modifiedContent, decisions)
    await writeTextFile(projectRoot, review.filePath, currentContent)
    this.db.prepare(`
      UPDATE file_reviews SET decisions_json = ?, status = ?, updated_at = ? WHERE id = ?
    `).run(JSON.stringify(decisions), status, updatedAt, reviewId)
    return this.require(reviewId)
  }

  deleteForSession(sessionId: string): number {
    return this.db.prepare('DELETE FROM file_reviews WHERE session_id = ?').run(sessionId).changes
  }

  close(): void {
    this.db.close()
  }

  private require(reviewId: string): FileReviewRecord {
    const review = this.get(reviewId)
    if (!review) throw new Error(`File review not found: ${reviewId}`)
    return review
  }
}

function toReview(row: FileReviewRow): FileReviewRecord {
  const groups = createDiffGroups(row.original_content, row.proposed_content)
  const decisions = parseDecisions(row.decisions_json, groups.length)
  return {
    checkpointId: row.checkpoint_id,
    createdAt: row.created_at,
    currentContent: mergeReview(row.original_content, row.proposed_content, decisions),
    filePath: row.file_path,
    hunks: groups.map((group, index) => ({
      ...group,
      decision: decisions[index]!,
      id: `${row.id}:hunk-${index}`,
      index,
    })),
    id: row.id,
    modifiedContent: row.proposed_content,
    originalContent: row.original_content,
    sessionId: row.session_id,
    status: row.status,
    updatedAt: row.updated_at,
  }
}

function createDiffGroups(originalContent: string, modifiedContent: string): DiffGroup[] {
  const parts = diffLines(originalContent, modifiedContent)
  const groups: DiffGroup[] = []
  let originalLine = 1
  let modifiedLine = 1

  for (let index = 0; index < parts.length;) {
    const part = parts[index]!
    if (!part.added && !part.removed) {
      originalLine += lineCount(part)
      modifiedLine += lineCount(part)
      index += 1
      continue
    }

    const group: DiffGroup = {
      modifiedContent: '',
      modifiedStart: modifiedLine,
      originalContent: '',
      originalStart: originalLine,
    }
    while (index < parts.length && (parts[index]!.added || parts[index]!.removed)) {
      const change = parts[index]!
      if (change.added) {
        group.modifiedContent += change.value
        modifiedLine += lineCount(change)
      } else {
        group.originalContent += change.value
        originalLine += lineCount(change)
      }
      index += 1
    }
    groups.push(group)
  }

  return groups
}

function mergeReview(originalContent: string, modifiedContent: string, decisions: FileReviewDecision[]): string {
  const parts = diffLines(originalContent, modifiedContent)
  let result = ''
  let hunkIndex = 0

  for (let index = 0; index < parts.length;) {
    const part = parts[index]!
    if (!part.added && !part.removed) {
      result += part.value
      index += 1
      continue
    }

    let original = ''
    let modified = ''
    while (index < parts.length && (parts[index]!.added || parts[index]!.removed)) {
      const change = parts[index]!
      if (change.added) modified += change.value
      else original += change.value
      index += 1
    }
    result += decisions[hunkIndex] === 'rejected' ? original : modified
    hunkIndex += 1
  }
  return result
}

function lineCount(change: Change): number {
  return change.count ?? (change.value.match(/\n/g)?.length ?? 0)
}

function parseDecisions(value: string, expectedLength: number): FileReviewDecision[] {
  try {
    const parsed = JSON.parse(value) as unknown
    if (Array.isArray(parsed)
      && parsed.length === expectedLength
      && parsed.every((decision) => ['pending', 'accepted', 'rejected'].includes(String(decision)))) {
      return parsed as FileReviewDecision[]
    }
  } catch {
    // Fall through to the safe pending state for a damaged row.
  }
  return Array.from({ length: expectedLength }, () => 'pending')
}

function statusFor(decisions: FileReviewDecision[]): FileReviewStatus {
  if (decisions.some((decision) => decision === 'pending')) return 'pending'
  if (decisions.every((decision) => decision === 'accepted')) return 'accepted'
  if (decisions.every((decision) => decision === 'rejected')) return 'rejected'
  return 'mixed'
}
