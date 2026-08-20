import type {
  AxisPivotReplanRunDriveRequest,
  AxisPivotReplanRunDriveResult,
} from '../../shared/axis-pivot-replan-run-driver-contracts'

export interface AxisPivotReplanRunDriverPort {
  drive(
    request: AxisPivotReplanRunDriveRequest,
  ): Promise<AxisPivotReplanRunDriveResult>
}

export interface AxisPivotReplanRunDriveResultPort {
  find(decisionId: string): AxisPivotReplanRunDriveResult | null
  save(result: AxisPivotReplanRunDriveResult): AxisPivotReplanRunDriveResult
}
