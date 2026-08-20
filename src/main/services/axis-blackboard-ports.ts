import type {
  AxisBlackboardBinding,
  AxisBlackboardEvidenceWrite,
  AxisBlackboardFactWrite,
  AxisBlackboardRunBinding,
  AxisBlackboardSnapshot,
  AxisBlackboardView,
} from '../../shared/axis-blackboard-contracts'

export interface AxisBlackboardReaderPort {
  read(): AxisBlackboardView
}

export interface AxisBlackboardWriterPort {
  appendEvidence(request: AxisBlackboardEvidenceWrite): AxisBlackboardView
  appendFact(request: AxisBlackboardFactWrite): AxisBlackboardView
}

export interface AxisTaskBlackboardPort extends AxisBlackboardReaderPort, AxisBlackboardWriterPort {}

export interface AxisBlackboardPortFactory {
  openTaskPort(binding: AxisBlackboardBinding): AxisTaskBlackboardPort
}

export interface AxisBlackboardAdminPort {
  close(): void
  create(binding: AxisBlackboardRunBinding): AxisBlackboardSnapshot
  delete(binding: AxisBlackboardRunBinding): void
  deleteForSession(sessionId: string): number
  getFull(binding: AxisBlackboardRunBinding): AxisBlackboardSnapshot | null
}
