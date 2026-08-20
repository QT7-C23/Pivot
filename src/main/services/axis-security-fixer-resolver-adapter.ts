import {
  AxisDedicatedFixerIdentitySchema,
  type AxisDedicatedFixerIdentity,
} from '../../shared/axis-dedicated-fixer-contracts'
import type {
  AxisDedicatedFixerResolverPort,
} from './axis-dedicated-fixer-ports'

export class AxisSecurityFixerResolverAdapter {
  openResolverPort(): AxisDedicatedFixerResolverPort {
    const port: AxisDedicatedFixerResolverPort = {
      resolveSecurityFixer: () => this.resolveSecurityFixer(),
    }
    return Object.freeze(port)
  }

  private resolveSecurityFixer(): AxisDedicatedFixerIdentity {
    return AxisDedicatedFixerIdentitySchema.parse({
      fixerId: 'security-fixer',
      role: 'security-fixer',
      schemaVersion: 1,
      specialty: 'security',
    })
  }
}
