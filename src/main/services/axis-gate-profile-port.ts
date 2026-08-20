import type { AxisGateProfile } from '../../shared/axis-gate-profile-contracts'

export interface AxisGateProfilePort {
  resolve(binding: { projectRoot: string; sessionId: string }): AxisGateProfile | null
}
