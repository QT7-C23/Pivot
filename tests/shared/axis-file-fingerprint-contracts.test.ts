import { describe, expect, it } from 'vitest'
import {
  AxisFileFingerprintCaptureRequestSchema,
  AxisFileFingerprintEvidenceSchema,
  AxisFileFingerprintVerificationBatchSchema,
  AxisFileFingerprintVerifyRequestSchema,
} from '../../src/shared/axis-file-fingerprint-contracts'

describe('Axis external file fingerprint contracts', () => {
  it('accepts strictly bound evidence for existing and missing files', () => {
    expect(AxisFileFingerprintEvidenceSchema.parse(validEvidence())).toMatchObject({
      fileKey: 'a'.repeat(64),
      state: {
        byteLength: 12,
        kind: 'exists',
      },
      taskId: 'task-1',
    })
    expect(AxisFileFingerprintEvidenceSchema.parse(validEvidence({
      state: { kind: 'missing' },
    }))).toMatchObject({
      state: { kind: 'missing' },
    })
  })

  it('rejects malformed hashes, invalid time ordering, and mixed state fields', () => {
    expect(() => AxisFileFingerprintEvidenceSchema.parse(validEvidence({
      state: {
        byteLength: 12,
        contentSha256: 'not-a-hash',
        fileInstanceSha256: 'b'.repeat(64),
        kind: 'exists',
      },
    }))).toThrow(/sha-256/i)
    expect(() => AxisFileFingerprintEvidenceSchema.parse(validEvidence({
      expiresAt: '2026-07-27T00:00:00.000Z',
    }))).toThrow(/expiry/i)
    expect(() => AxisFileFingerprintEvidenceSchema.parse(validEvidence({
      state: {
        contentSha256: 'c'.repeat(64),
        kind: 'missing',
      },
    }))).toThrow()
  })

  it('bounds capture and verify requests without accepting ownership fields', () => {
    expect(AxisFileFingerprintCaptureRequestSchema.parse({
      filePaths: ['src/app.ts', 'src/new.ts'],
    })).toEqual({
      filePaths: ['src/app.ts', 'src/new.ts'],
    })
    expect(() => AxisFileFingerprintCaptureRequestSchema.parse({
      filePaths: [],
    })).toThrow()
    expect(() => AxisFileFingerprintCaptureRequestSchema.parse({
      filePaths: Array.from({ length: 129 }, (_, index) => `src/${index}.ts`),
    })).toThrow()
    expect(() => AxisFileFingerprintCaptureRequestSchema.parse({
      filePaths: ['src/app.ts'],
      taskId: 'task-other',
    })).toThrow()
    expect(() => AxisFileFingerprintVerifyRequestSchema.parse({
      evidence: [validEvidence(), validEvidence()],
    })).toThrow(/duplicate/i)
  })

  it('requires batch status to agree with every verification result', () => {
    const matched = {
      checkedAt: '2026-07-27T00:00:01.000Z',
      evidenceId: 'fingerprint-1',
      fileKey: 'a'.repeat(64),
      projectRelativePath: 'src/app.ts',
      reason: null,
      status: 'matched' as const,
    }
    expect(AxisFileFingerprintVerificationBatchSchema.parse({
      results: [matched],
      schemaVersion: 1,
      status: 'matched',
    }).status).toBe('matched')
    expect(() => AxisFileFingerprintVerificationBatchSchema.parse({
      results: [{
        ...matched,
        reason: 'modified',
        status: 'rejected',
      }],
      schemaVersion: 1,
      status: 'matched',
    })).toThrow(/status/i)
  })
})

function validEvidence(overrides: Record<string, unknown> = {}) {
  return {
    capturedAt: '2026-07-27T00:00:00.000Z',
    evidenceId: 'fingerprint-1',
    expiresAt: '2026-07-27T00:01:00.000Z',
    fileKey: 'a'.repeat(64),
    projectId: 'project-1',
    projectRelativePath: 'src/app.ts',
    proof: 'p'.repeat(43),
    runId: 'run-1',
    schemaVersion: 1 as const,
    sessionId: 'session-1',
    state: {
      byteLength: 12,
      contentSha256: 'c'.repeat(64),
      fileInstanceSha256: 'b'.repeat(64),
      kind: 'exists' as const,
    },
    taskId: 'task-1',
    ...overrides,
  }
}
