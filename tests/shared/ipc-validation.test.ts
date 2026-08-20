import { describe, expect, it } from 'vitest'
import { validateIpcRequest } from '../../src/shared/ipc-validation'
import { axisReviewedProposalReceipt } from '../fixtures/axis-reviewed-proposal'

describe('validateIpcRequest', () => {
  it('validates provider model probes without accepting credentials or endpoints', () => {
    expect(validateIpcRequest('provider:probe-models', { providerId: 'openai' }))
      .toEqual({ forceRefresh: false, providerId: 'openai' })
    expect(() => validateIpcRequest('provider:probe-models', { apiKey: 'secret', providerId: 'openai' })).toThrow()
    expect(() => validateIpcRequest('provider:probe-models', { baseUrl: 'https://evil.invalid', providerId: 'openai' })).toThrow()
  })

  it('accepts valid permission decisions and rejects behavior outside the contract', () => {
    expect(validateIpcRequest('chat:permission', { behavior: 'deny', requestId: 'permission-1' })).toEqual({
      behavior: 'deny',
      requestId: 'permission-1',
    })
    expect(() => validateIpcRequest('chat:permission', {
      behavior: 'allow_always',
      requestId: 'permission-1',
    })).toThrow('expected "behavior" to be one of: allow, allow_session, deny')
  })

  it('requires an authoritative session boundary on file and terminal requests', () => {
    expect(() => validateIpcRequest('fs:read', { filePath: 'C:\\project\\README.md' })).toThrow(
      'expected "sessionId" to be a string',
    )
    expect(() => validateIpcRequest('term:create', { cwd: 'C:\\project' })).toThrow(
      'expected "sessionId" to be a string',
    )
  })

  it('rejects invalid terminal dimensions', () => {
    expect(() => validateIpcRequest('term:resize', { cols: 0, id: 'term-1', rows: 24 })).toThrow(
      'expected "cols" to be a positive integer',
    )
  })

  it('accepts undefined or empty requests only for no-input channels', () => {
    expect(validateIpcRequest('agent:info', undefined)).toBeUndefined()
    expect(validateIpcRequest('session:list', {})).toEqual({})
    expect(() => validateIpcRequest('session:list', { injected: true })).toThrow('unknown field(s): injected')
  })

  it('rejects transport and debug fields outside the exact request contract', () => {
    expect(() => validateIpcRequest('chat:send', {
      already_streamed: true,
      sessionId: 'session-1',
      text: 'hello',
    })).toThrow('unknown field(s): already_streamed')
    expect(() => validateIpcRequest('chat:send', {
      context: { activeFilePath: 'C:\\project\\a.ts', facts: ['injected'] },
      sessionId: 'session-1',
      text: 'hello',
    })).toThrow('unknown field(s): facts')
  })

  it('accepts bounded reasoning context but rejects renderer-supplied project roots', () => {
    expect(validateIpcRequest('chat:send', {
      context: { interactionMode: 'agent', reasoningEffort: 5 },
      sessionId: 'session-1',
      text: 'review',
    })).toMatchObject({ context: { interactionMode: 'agent', reasoningEffort: 5 } })
    expect(() => validateIpcRequest('chat:send', {
      context: { projectPath: 'C:\\' },
      sessionId: 'session-1',
      text: 'review',
    })).toThrow('unknown field(s): projectPath')
  })

  it('accepts a bounded list of referenced file paths and rejects empty entries', () => {
    expect(validateIpcRequest('chat:send', {
      context: { referencedFilePaths: ['C:\\project\\a.ts'] },
      sessionId: 'session-1',
      text: 'review',
    })).toMatchObject({ context: { referencedFilePaths: ['C:\\project\\a.ts'] } })

    expect(() => validateIpcRequest('chat:send', {
      context: { referencedFilePaths: [''] },
      sessionId: 'session-1',
      text: 'review',
    })).toThrow('expected "referencedFilePaths" entries to be non-empty')
  })

  it('validates exact file review resolutions', () => {
    expect(validateIpcRequest('fs:resolve-review', {
      resolution: { decision: 'reject', hunkIndex: 0 },
      reviewId: 'review-1',
    })).toEqual({ resolution: { decision: 'reject', hunkIndex: 0 }, reviewId: 'review-1' })
    expect(() => validateIpcRequest('fs:resolve-review', {
      resolution: { decision: 'maybe' },
      reviewId: 'review-1',
    })).toThrow('expected "decision" to be one of: accept, reject, reset')
  })

  it('keeps timeline listing and restore within explicit session and review contracts', () => {
    expect(validateIpcRequest('timeline:list', { sessionId: 'session-1' })).toEqual({ sessionId: 'session-1' })
    expect(validateIpcRequest('timeline:restore-change', { reviewId: 'review-1' })).toEqual({ reviewId: 'review-1' })
    expect(() => validateIpcRequest('timeline:list', { projectRoot: 'C:\\project', sessionId: 'session-1' })).toThrow('unknown field(s): projectRoot')
    expect(() => validateIpcRequest('timeline:restore-change', { reviewId: '' })).toThrow('expected "reviewId" to be non-empty')
  })

  it('accepts single-segment file creation names and rejects traversal', () => {
    expect(validateIpcRequest('fs:create-file', {
      name: 'index.ts',
      parentPath: 'C:\\project\\src',
      sessionId: 'session-1',
    })).toMatchObject({ name: 'index.ts' })
    expect(() => validateIpcRequest('fs:create-directory', {
      name: '..',
      parentPath: 'C:\\project',
      sessionId: 'session-1',
    })).toThrow('single path segment')
  })

  it('validates Preview external navigation as an HTTPS or loopback address', () => {
    expect(validateIpcRequest('preview:open-external', { url: 'https://example.com/' })).toEqual({
      url: 'https://example.com/',
    })
    expect(validateIpcRequest('preview:open-external', { url: 'http://localhost:3000/' })).toEqual({
      url: 'http://localhost:3000/',
    })
    expect(() => validateIpcRequest('preview:open-external', { url: 'file:///C:/secret.txt' })).toThrow(
      'expected "url" to be an allowed Preview URL',
    )
  })

  it('keeps application update actions as no-input exact contracts', () => {
    expect(validateIpcRequest('update:state', undefined)).toBeUndefined()
    expect(validateIpcRequest('update:check', {})).toEqual({})
    expect(() => validateIpcRequest('update:download', { url: 'https://injected.example' })).toThrow('unknown field(s): url')
  })

  it('keeps global work plan listing as a no-input exact contract', () => {
    expect(validateIpcRequest('plan:list-all', {})).toEqual({})
    expect(() => validateIpcRequest('plan:list-all', { sessionId: 'injected' })).toThrow('unknown field(s): sessionId')
  })

  it('keeps Axis Shadow planning opt-in, bounded, and free of renderer-supplied context', () => {
    expect(validateIpcRequest('axis:shadow-state', {})).toEqual({})
    expect(validateIpcRequest('axis:set-shadow-enabled', { enabled: true })).toEqual({ enabled: true })
    expect(validateIpcRequest('axis:list-traces', { sessionId: 'session-1' })).toEqual({ sessionId: 'session-1' })
    expect(validateIpcRequest('axis:list-run-states', { sessionId: 'session-1' })).toEqual({ sessionId: 'session-1' })
    expect(validateIpcRequest('axis:cancel-run', { expectedRevision: 2, runId: 'run-1', sessionId: 'session-1' }))
      .toEqual({ expectedRevision: 2, runId: 'run-1', sessionId: 'session-1' })
    expect(validateIpcRequest('axis:restart-run', { expectedRevision: 3, runId: 'run-1', sessionId: 'session-1' }))
      .toEqual({ expectedRevision: 3, runId: 'run-1', sessionId: 'session-1' })
    expect(validateIpcRequest('axis:dry-run-state', {})).toEqual({})
    expect(validateIpcRequest('axis:set-dry-run-enabled', { enabled: true })).toEqual({ enabled: true })
    expect(validateIpcRequest('axis:execute-dry-run', {
      approvedTaskIds: ['inspect'], expectedRevision: 3, runId: 'run-1', sessionId: 'session-1',
    })).toEqual({ approvedTaskIds: ['inspect'], expectedRevision: 3, runId: 'run-1', sessionId: 'session-1' })
    expect(() => validateIpcRequest('axis:execute-dry-run', {
      approvedTaskIds: ['inspect', 'inspect'], expectedRevision: 3, runId: 'run-1', sessionId: 'session-1',
    })).toThrow()
    expect(() => validateIpcRequest('axis:cancel-run', { expectedRevision: 0, runId: 'run-1', sessionId: 'session-1' })).toThrow()
    expect(validateIpcRequest('axis:plan-shadow', {
      budget: {
        maxCostUsd: 1, maxDurationMs: 60_000, maxGateCyclesPerFile: 3, maxPivots: 2,
        maxRetriesPerTask: 1, maxTokens: 10_000, maxWorkers: 4,
      },
      objective: 'Plan this change',
      sessionId: 'session-1',
    })).toMatchObject({ objective: 'Plan this change', sessionId: 'session-1' })
    expect(() => validateIpcRequest('axis:plan-shadow', {
      budget: {
        maxCostUsd: 1, maxDurationMs: 60_000, maxGateCyclesPerFile: 3, maxPivots: 2,
        maxRetriesPerTask: 1, maxTokens: 10_000, maxWorkers: 9,
      },
      context: { availableFiles: ['C:\\secret'], constraints: [] },
      objective: 'Plan this change',
      sessionId: 'session-1',
    })).toThrow()
  })

  it('validates bounded semantic review telemetry reads without privileged selectors', () => {
    expect(validateIpcRequest('axis:list-semantic-review-telemetry', { limit: 25, sessionId: 'session-1' }))
      .toEqual({ limit: 25, sessionId: 'session-1' })
    expect(() => validateIpcRequest('axis:list-semantic-review-telemetry', {
      databasePath: 'secret.db', limit: 25, sessionId: 'session-1',
    })).toThrow(/unknown field/i)
    expect(() => validateIpcRequest('axis:list-semantic-review-telemetry', { limit: 101, sessionId: 'session-1' })).toThrow()
  })

  it('keeps Reviewer qualification and routing free of secrets and storage authority', () => {
    expect(validateIpcRequest('axis:qualify-reviewer', { modelId: 'review', providerId: 'p1' }))
      .toEqual({ modelId: 'review', providerId: 'p1' })
    expect(validateIpcRequest('axis:get-reviewer-routing', {})).toEqual({})
    expect(() => validateIpcRequest('axis:qualify-reviewer', {
      apiKey: 'secret', modelId: 'review', providerId: 'p1',
    })).toThrow(/apiKey/)
    expect(() => validateIpcRequest('axis:get-reviewer-routing', { databasePath: 'forged.db' })).toThrow(/databasePath/)
  })

  it('accepts only a narrow guarded safe-write submission and rejects forged authority context', () => {
    expect(validateIpcRequest('axis:propose-guarded-safe-write', {
      expectedRevision: 1,
      runId: 'run-1',
      sessionId: 'session-1',
      taskId: 'task-1',
    })).toEqual({
      expectedRevision: 1,
      runId: 'run-1',
      sessionId: 'session-1',
      taskId: 'task-1',
    })
    expect(() => validateIpcRequest('axis:propose-guarded-safe-write', {
      expectedRevision: 1,
      projectRoot: 'C:\\forged',
      runId: 'run-1',
      sessionId: 'session-1',
      taskId: 'task-1',
    } as never)).toThrow(/projectRoot/)
    expect(() => validateIpcRequest('axis:propose-guarded-safe-write', {
      authority: { tools: ['fs.safeWrite'] },
      expectedRevision: 1,
      runId: 'run-1',
      sessionId: 'session-1',
      taskId: 'task-1',
    } as never)).toThrow(/authority/)

    const guardedRequest = {
      expectedRevision: 1,
      reviewedProposalReceipt: axisReviewedProposalReceipt(),
      runId: 'run-1',
      sessionId: 'session-1',
      taskId: 'task-1',
      writes: [{ content: 'after', filePath: 'src/one.ts' }],
    }
    expect(validateIpcRequest(
      'axis:execute-guarded-safe-write',
      guardedRequest,
    )).toEqual(guardedRequest)
    expect(() => validateIpcRequest('axis:execute-guarded-safe-write', {
      ...guardedRequest,
      projectRoot: 'C:\\forged',
    } as never)).toThrow(/projectRoot/)
    expect(() => validateIpcRequest('axis:execute-guarded-safe-write', {
      ...guardedRequest,
      task: { id: 'forged' },
    } as never)).toThrow(/task/)
  })
})
