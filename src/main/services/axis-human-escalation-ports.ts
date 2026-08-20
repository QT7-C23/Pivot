import type {
  AxisHumanEscalationCreateInput,
  AxisHumanEscalationReceipt,
} from '../../shared/axis-human-escalation-contracts'

export interface AxisHumanEscalationPort {
  findByDecision(decisionId: string): AxisHumanEscalationReceipt | null
  open(input: AxisHumanEscalationCreateInput): AxisHumanEscalationReceipt
}
