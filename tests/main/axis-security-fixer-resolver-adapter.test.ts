import { describe, expect, it } from 'vitest'
import { AxisSecurityFixerResolverAdapter } from '../../src/main/services/axis-security-fixer-resolver-adapter'

describe('Axis security Fixer resolver adapter', () => {
  it('returns one frozen code-owned security Fixer Port', () => {
    const port = new AxisSecurityFixerResolverAdapter().openResolverPort()

    expect(Object.isFrozen(port)).toBe(true)
    expect(port.resolveSecurityFixer()).toEqual({
      fixerId: 'security-fixer',
      role: 'security-fixer',
      schemaVersion: 1,
      specialty: 'security',
    })
  })

  it('returns detached validated identity values', () => {
    const port = new AxisSecurityFixerResolverAdapter().openResolverPort()
    const first = port.resolveSecurityFixer()
    const second = port.resolveSecurityFixer()

    expect(first).not.toBe(second)
    expect(first).toEqual(second)
  })
})
