import type {
  AxisDedicatedFixerAssignment,
  AxisDedicatedFixerAssignmentCreateInput,
  AxisDedicatedFixerIdentity,
} from '../../shared/axis-dedicated-fixer-contracts'

export interface AxisDedicatedFixerResolverPort {
  resolveSecurityFixer(): AxisDedicatedFixerIdentity
}

export interface AxisDedicatedFixerAssignmentPort {
  assign(
    input: AxisDedicatedFixerAssignmentCreateInput,
  ): AxisDedicatedFixerAssignment
  findByDecision(decisionId: string): AxisDedicatedFixerAssignment | null
}
