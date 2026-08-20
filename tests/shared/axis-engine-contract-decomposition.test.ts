import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  AxisExecutionAuthorityEnvelopeSchema as CompatibilityAuthoritySchema,
  AxisGateBatchResultSchema as CompatibilityGateSchema,
} from '../../src/shared/axis-engine-contracts'
import { AxisExecutionAuthorityEnvelopeSchema } from '../../src/shared/axis-execution-contracts'
import { AxisGateBatchResultSchema } from '../../src/shared/axis-gate-contracts'

describe('Axis Engine contract decomposition', () => {
  it('keeps every contract module below the repository line ceiling', async () => {
    for (const relativePath of [
      'axis-engine-contracts.ts',
      'axis-execution-contracts.ts',
      'axis-gate-contracts.ts',
    ]) {
      const content = await readFile(path.resolve('src/shared', relativePath), 'utf8')
      expect(content.split(/\r?\n/).length, relativePath).toBeLessThanOrEqual(800)
      expect(content).not.toMatch(/from ['"].*\/(main|renderer)\//)
    }
  })

  it('preserves the legacy barrel as the exact same runtime schemas', () => {
    expect(CompatibilityAuthoritySchema).toBe(AxisExecutionAuthorityEnvelopeSchema)
    expect(CompatibilityGateSchema).toBe(AxisGateBatchResultSchema)
  })
})
