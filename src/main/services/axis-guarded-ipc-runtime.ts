import { randomBytes } from 'node:crypto'
import {
  AxisGuardedSafeWriteFeatureStateSchema,
  type AxisGuardedSafeWriteFeatureState,
  type AxisGuardedSafeWriteSubmission,
  type AxisGuardedSafeWriteSubmissionResult,
} from '../../shared/axis-guarded-safe-write-contracts'
import type { AxisAuthorityAuditPort } from './axis-authority-audit-registry'
import type { AxisCheckpointStorePort } from './axis-checkpoint-receipt-issuer'
import type { AxisFileLeasePortFactory } from './axis-file-lease-ports'
import type { AxisGateCommandRunPort } from './axis-gate-runner'
import type { AxisGateProfilePort } from './axis-gate-profile-port'
import { AxisGuardedSafeWriteSubmissionService } from './axis-guarded-safe-write-submission'
import type {
  AxisGuardedRunStatePort,
  AxisGuardedTaskReaderPort,
} from './axis-guarded-safe-write-ports'
import { AxisPermissionManagerPort } from './axis-permission-manager-port'
import type { AxisCheckpointRollbackStore } from './axis-physical-rollback-executor'
import type { AxisProjectBindingReaderPort } from './axis-project-binding-ports'
import type { AxisProjectFileIdentityPort } from './axis-file-lease-ports'
import { AxisExternalFileFingerprintAdapter } from './axis-external-file-fingerprint-adapter'
import { AxisReviewedProposalReceiptService } from './axis-reviewed-proposal-receipt'
import type { AxisSemanticReviewProductionRuntime } from './axis-semantic-review-production-config'
import type { AxisSemanticReviewTelemetryReaderPort } from './axis-semantic-review-telemetry-service'
import type {
  AxisReviewedProposalReceiptIssuerPort,
  AxisReviewedProposalReceiptVerifierPort,
} from './axis-reviewed-proposal-ports'
import {
  createAxisProductionGuardedRuntime,
  resolveAxisRealExecutionFeature,
} from './axis-production-guarded-runtime'
import type { PermissionManager, PermissionSignalSender } from './permission-manager'
import type {
  AxisGuardedSafeWriteSubmissionPort,
} from './axis-pivot-guarded-continuation-ports'
import {
  AxisTrustedGateProfileAdapter,
  pivotTrustedGateProfile,
} from './axis-trusted-gate-profile-adapter'

type AxisCheckpointRuntimeStore = AxisCheckpointStorePort & AxisCheckpointRollbackStore

export interface AxisGuardedIpcRuntime {
  close(): void
  deleteForSession(sessionId: string): void
  featureState(): AxisGuardedSafeWriteFeatureState
  openReviewedProposalIssuerPort(): AxisReviewedProposalReceiptIssuerPort | null
  openSubmissionPort(): AxisGuardedSafeWriteSubmissionPort
  openSemanticReviewTelemetryReaderPort(): AxisSemanticReviewTelemetryReaderPort | null
  readonly ready: Promise<void>
  submit(
    request: AxisGuardedSafeWriteSubmission,
  ): Promise<AxisGuardedSafeWriteSubmissionResult>
}

export function createAxisGuardedIpcRuntime(options: {
  authorityAudit: AxisAuthorityAuditPort
  checkpoints: AxisCheckpointRuntimeStore
  commandRunner: AxisGateCommandRunPort
  databasePath?: string
  env: Readonly<Record<string, string | undefined>>
  fileLeases: AxisFileLeasePortFactory
  gateProfiles?: AxisGateProfilePort
  identity: AxisProjectFileIdentityPort
  permissionManager: PermissionManager
  projectBindings: AxisProjectBindingReaderPort
  runStates: AxisGuardedRunStatePort
  sendSignal: PermissionSignalSender
  semanticReview?: AxisSemanticReviewProductionRuntime
  tasks: AxisGuardedTaskReaderPort
}): AxisGuardedIpcRuntime {
  const feature = resolveAxisRealExecutionFeature(options.env)
  const fingerprints = feature.isRealExecutionEnabled()
    ? new AxisExternalFileFingerprintAdapter({
        identity: options.identity,
        projectBindings: options.projectBindings,
        proofSecret: randomBytes(32),
      })
    : null
  const reviewedProposals = fingerprints
    ? new AxisReviewedProposalReceiptService({
        fingerprints,
        identity: options.identity,
        secret: randomBytes(32),
      })
    : null
  const runtime = createAxisProductionGuardedRuntime({
    authorityAudit: options.authorityAudit,
    checkpoints: options.checkpoints,
    commandRunner: options.commandRunner,
    databasePath: options.databasePath,
    feature,
    fileFingerprints: fingerprints ?? undefined,
    fileLeases: options.fileLeases,
    gateProfiles: options.gateProfiles ?? new AxisTrustedGateProfileAdapter({
      profile: pivotTrustedGateProfile(),
      projects: options.projectBindings,
    }),
    identity: options.identity,
    permissions: new AxisPermissionManagerPort({
      permissions: options.permissionManager,
      sendSignal: options.sendSignal,
    }),
    projectBindings: options.projectBindings,
    semanticReview: options.semanticReview,
  })
  const submissions = new AxisGuardedSafeWriteSubmissionService({
    execution: runtime?.openExecutionPort() ?? null,
    projects: options.projectBindings,
    reviewedProposals: reviewedProposals?.openVerifierPort()
      ?? disabledReviewedProposalVerifier(),
    runStates: options.runStates,
    tasks: options.tasks,
  })

  return Object.freeze({
    close: () => runtime?.close(),
    deleteForSession: (sessionId: string) => runtime?.deleteForSession(sessionId),
    featureState: () => AxisGuardedSafeWriteFeatureStateSchema.parse(
      feature.isRealExecutionEnabled()
        ? { enabled: true, reason: null }
        : { enabled: false, reason: 'disabled' },
    ),
    openReviewedProposalIssuerPort: () => (
      reviewedProposals?.openIssuerPort() ?? null
    ),
    openSubmissionPort: () => Object.freeze({
      submit: (request: AxisGuardedSafeWriteSubmission) => submissions.submit(request),
    }),
    openSemanticReviewTelemetryReaderPort: () => runtime?.openSemanticReviewTelemetryReaderPort() ?? null,
    ready: runtime?.ready ?? Promise.resolve(),
    submit: (request: AxisGuardedSafeWriteSubmission) => submissions.submit(request),
  })
}

function disabledReviewedProposalVerifier(): AxisReviewedProposalReceiptVerifierPort {
  return Object.freeze({
    verify: async () => {
      throw new Error('Axis reviewed proposal verification is disabled')
    },
  })
}
